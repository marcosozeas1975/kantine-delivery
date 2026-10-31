/**
 * TG-ACCEPT Comprehensive Verification Suite
 * 
 * TG-ACCEPT-01: Aceite Normal — 3 motoristas recebem oferta; A vence; B e C têm botões removidos e texto editado
 * TG-ACCEPT-02: Privacidade — Mensagem editada/fallback de B e C NÃO vaza nenhum dado pessoal do vencedor (nome, fone, tg, pix)
 * TG-ACCEPT-03: Concorrência — Aceites simultâneos de A e B resultam em exatamente 1 WON, 1 LOST, sem duplicidade
 * TG-ACCEPT-04: Callback Antigo — Callback de versão obsoleta ou tardio não altera o banco e responde amigavelmente
 * TG-ACCEPT-05: Message ID — telegram_message_id gravado em routeOfferDispatches é exatamente o utilizado na invalidação
 * TG-ACCEPT-06: Falha Telegram — Erro no editMessageText preserva o aceite no banco, não é silencioso e dispara fallback
 */

import { db, initDbConstraints } from '../src/db/index.ts';
import {
  drivers,
  routes,
  routeStops,
  routeEvents,
  routeOfferDispatches,
  pickupLocations,
} from '../src/db/schema.ts';
import { routeService } from '../src/server/routeService.ts';
import { driverService } from '../src/server/driverService.ts';
import { referralService } from '../src/server/referralService.ts';
import { telegramBot } from '../src/server/telegramBot.ts';
import { eq, and } from 'drizzle-orm';

async function runTgAcceptSuite() {
  console.log('🚀 INICIANDO SUÍTE DE TESTES: TG-ACCEPT — INVALIDAÇÃO REAL DAS OFERTAS TELEGRAM\n');
  await initDbConstraints();

  const timestamp = Date.now();

  telegramBot.setDriverService(driverService);
  telegramBot.setReferralService(referralService);
  telegramBot.setRouteService(routeService);

  // Registro de chamadas Telegram
  interface TelegramCall {
    method: string;
    body: any;
    timestamp: number;
  }
  const apiCalls: TelegramCall[] = [];
  let nextMessageId = 700000;
  let forceEditFailure = false;

  const originalCallApi = (telegramBot as any).callTelegramApi.bind(telegramBot);
  (telegramBot as any).callTelegramApi = async (method: string, data: any) => {
    apiCalls.push({ method, body: data, timestamp: Date.now() });

    if (method === 'sendMessage') {
      const msgId = ++nextMessageId;
      return { message_id: msgId, chat: { id: data.chat_id, type: 'private' }, text: data.text };
    }

    if (method === 'editMessageText') {
      if (forceEditFailure) {
        throw new Error('Telegram API simulated error: 400 Bad Request: message to edit not found');
      }
      return { message_id: data.message_id, chat: { id: data.chat_id, type: 'private' }, text: data.text };
    }

    if (method === 'editMessageReplyMarkup') {
      return { message_id: data.message_id, chat: { id: data.chat_id, type: 'private' } };
    }

    return originalCallApi(method, data);
  };

  // 1. Criar Ponto de Coleta
  const [pickupLoc] = await db
    .insert(pickupLocations)
    .values({
      name: `Kantine Centro ${timestamp}`,
      address: 'Rua Santos Dumont, 500 - Centro, Uberlândia',
      neighborhood: 'Centro',
      active: true,
    })
    .returning();

  // 2. Criar 3 motoristas ativos elegíveis (CAR_HATCH)
  const [driverA] = await db
    .insert(drivers)
    .values({
      name: `Carlos Winner ${timestamp}`,
      phone: `34991${Math.floor(100000 + Math.random() * 900000)}`,
      vehicle_type: 'CAR_HATCH',
      pix_key_type: 'PHONE',
      pix_key_value: '+5534991118888',
      status: 'ACTIVE',
      telegram_chat_id: `chat_win_a_${timestamp}`,
      telegram_user_id: `tg_win_a_${timestamp}`,
    })
    .returning();

  const [driverB] = await db
    .insert(drivers)
    .values({
      name: `Bruno Loser ${timestamp}`,
      phone: `34992${Math.floor(100000 + Math.random() * 900000)}`,
      vehicle_type: 'CAR_HATCH',
      pix_key_type: 'PHONE',
      pix_key_value: '+5534992228888',
      status: 'ACTIVE',
      telegram_chat_id: `chat_los_b_${timestamp}`,
      telegram_user_id: `tg_los_b_${timestamp}`,
    })
    .returning();

  const [driverC] = await db
    .insert(drivers)
    .values({
      name: `Caio Loser ${timestamp}`,
      phone: `34993${Math.floor(100000 + Math.random() * 900000)}`,
      vehicle_type: 'CAR_HATCH',
      pix_key_type: 'PHONE',
      pix_key_value: '+5534993338888',
      status: 'ACTIVE',
      telegram_chat_id: `chat_los_c_${timestamp}`,
      telegram_user_id: `tg_los_c_${timestamp}`,
    })
    .returning();

  // Helper para criar e publicar rota para A, B e C
  async function createAndPublishTestRoute(suffix: string) {
    const created = await routeService.createDraft({
      pickup_type: 'REGISTERED',
      pickup_location_id: pickupLoc.id,
      final_deadline: '17:30',
      total_fee: '45.00',
      override_reason: 'Frete ajustado para teste',
      accepted_vehicle_types: ['CAR_HATCH'],
      stops: [
        {
          destination_address: `Av. Rondon Pacheco, 100 - Tabajaras ${suffix}`,
          destination_neighborhood: 'Tabajaras',
          cargo_description: 'Doces Especiais',
          delivery_mode: 'IN_PERSON',
          customer_freight: 45,
        },
      ],
    });

    const pub = await routeService.publishRoute(created.id, 'TEST_ADMIN');
    return pub.route;
  }

  // =========================================================================
  // TG-ACCEPT-01: ACEITE NORMAL
  // =========================================================================
  console.log('=========================================================================');
  console.log('TG-ACCEPT-01: ACEITE NORMAL — VENCEDOR A, INVALIDAÇÃO TOTAL PARA B E C');
  console.log('=========================================================================');

  apiCalls.length = 0;
  const route01 = await createAndPublishTestRoute('01');

  // Verificar que A, B e C receberam ofertas com botão acionável
  const offersSent = apiCalls.filter(
    (c) => c.method === 'sendMessage' && c.body.reply_markup?.inline_keyboard?.[0]?.[0]?.text?.includes('ACEITAR')
  );
  if (offersSent.length < 3) {
    throw new Error(`TG-ACCEPT-01 FALHOU: esperava pelo menos 3 ofertas enviadas, encontrou ${offersSent.length}`);
  }

  // Motorista A aceita a rota
  apiCalls.length = 0;
  const acceptResultA = await routeService.acceptRoute(route01.id, {
    driverId: driverA.id,
  });

  if (acceptResultA.status !== 'WON') {
    throw new Error(`TG-ACCEPT-01 FALHOU: Motorista A deveria ser WON, obteve ${acceptResultA.status}`);
  }

  // Verificar banco: exatamente um accepted_driver_id e status ACCEPTED
  const dbRoute01 = await routeService.getRouteById(route01.id);
  if (dbRoute01?.status !== 'ACCEPTED' || dbRoute01.accepted_driver_id !== driverA.id) {
    throw new Error(`TG-ACCEPT-01 FALHOU: Banco não registrou Motorista A como vencedor exclusivo`);
  }

  // Verificar chamadas de invalidação para os perdedores B e C
  const editCalls = apiCalls.filter((c) => c.method === 'editMessageText');
  const chatIdsEdited = editCalls.map((c) => c.body.chat_id);

  if (!chatIdsEdited.includes(driverB.telegram_chat_id)) {
    throw new Error(`TG-ACCEPT-01 FALHOU: Mensagem de Motorista B não foi editada`);
  }
  if (!chatIdsEdited.includes(driverC.telegram_chat_id)) {
    throw new Error(`TG-ACCEPT-01 FALHOU: Mensagem de Motorista C não foi editada`);
  }
  if (chatIdsEdited.includes(driverA.telegram_chat_id)) {
    throw new Error(`TG-ACCEPT-01 FALHOU: Mensagem do Motorista VENCEDOR A foi incorretamente invalidada`);
  }

  // Provar que todos os editMessageText para B e C removeram o inline keyboard completamente
  for (const editCall of editCalls) {
    const keyboard = editCall.body.reply_markup?.inline_keyboard;
    if (!Array.isArray(keyboard) || keyboard.length !== 0) {
      throw new Error(`TG-ACCEPT-01 FALHOU: inline_keyboard não foi completamente esvaziado/removido na mensagem editada`);
    }
    // Provar que o texto informa claramente: 🔒 ROTA JÁ ACEITA POR OUTRO MOTORISTA
    if (!editCall.body.text.includes('🔒 ROTA JÁ ACEITA POR OUTRO MOTORISTA')) {
      throw new Error(`TG-ACCEPT-01 FALHOU: Texto editado não contém "🔒 ROTA JÁ ACEITA POR OUTRO MOTORISTA"`);
    }
  }

  console.log('✅ TG-ACCEPT-01 PASSOU: Motorista A venceu atomicamente, mensagens de B e C editadas com teclado completamente removido.');

  // =========================================================================
  // TG-ACCEPT-02: PRIVACIDADE DO VENCEDOR
  // =========================================================================
  console.log('\n=========================================================================');
  console.log('TG-ACCEPT-02: PRIVACIDADE DO VENCEDOR — DADOS PESSOAIS TOTALMENTE OMITIDOS');
  console.log('=========================================================================');

  for (const editCall of editCalls) {
    const text = editCall.body.text;
    if (text.includes(driverA.name)) {
      throw new Error(`TG-ACCEPT-02 FALHOU: Nome do vencedor "${driverA.name}" vazou na mensagem editada!`);
    }
    if (text.includes(driverA.phone)) {
      throw new Error(`TG-ACCEPT-02 FALHOU: Telefone do vencedor "${driverA.phone}" vazou na mensagem editada!`);
    }
    if (text.includes(driverA.telegram_chat_id)) {
      throw new Error(`TG-ACCEPT-02 FALHOU: Telegram chat_id do vencedor vazou na mensagem editada!`);
    }
    if (text.includes(driverA.telegram_user_id)) {
      throw new Error(`TG-ACCEPT-02 FALHOU: Telegram user_id do vencedor vazou na mensagem editada!`);
    }
    if (text.includes(driverA.pix_key_value)) {
      throw new Error(`TG-ACCEPT-02 FALHOU: Chave PIX do vencedor vazou na mensagem editada!`);
    }
  }

  console.log('✅ TG-ACCEPT-02 PASSOU: Nenhum identificador pessoal do vencedor A vazou nas mensagens dos perdedores.');

  // =========================================================================
  // TG-ACCEPT-03: CONCORRÊNCIA EXTREMA
  // =========================================================================
  console.log('\n=========================================================================');
  console.log('TG-ACCEPT-03: CONCORRÊNCIA SIMULTÂNEA ENTRE MOTORISTAS A E B');
  console.log('=========================================================================');

  apiCalls.length = 0;
  const route03 = await createAndPublishTestRoute('03');

  // A e B tentam aceitar a mesma rota no exato mesmo instante
  const [resA, resB] = await Promise.all([
    routeService.acceptRoute(route03.id, { driverId: driverA.id }),
    routeService.acceptRoute(route03.id, { driverId: driverB.id }),
  ]);

  const outcomes = [resA.status, resB.status];
  const wonCount = outcomes.filter((s) => s === 'WON').length;
  const lostCount = outcomes.filter((s) => s === 'LOST').length;

  if (wonCount !== 1 || lostCount !== 1) {
    throw new Error(`TG-ACCEPT-03 FALHOU: Esperava exatamente 1 WON e 1 LOST, obteve: resA=${resA.status}, resB=${resB.status}`);
  }

  const finalRoute03 = await routeService.getRouteById(route03.id);
  if (finalRoute03?.status !== 'ACCEPTED') {
    throw new Error(`TG-ACCEPT-03 FALHOU: Status final da rota deve ser ACCEPTED`);
  }

  // O perdedor deve ter sua mensagem de oferta invalidada
  const losingDriver = resA.status === 'WON' ? driverB : driverA;
  const editForLoser = apiCalls.find(
    (c) => c.method === 'editMessageText' && c.body.chat_id === losingDriver.telegram_chat_id
  );

  if (!editForLoser) {
    throw new Error(`TG-ACCEPT-03 FALHOU: Mensagem do perdedor ${losingDriver.name} não foi invalidada após disputa de concorrência`);
  }

  console.log(`✅ TG-ACCEPT-03 PASSOU: Concorrência resolvida com perfeição atômica (1 WON, 1 LOST). Perdedor invalidado.`);

  // =========================================================================
  // TG-ACCEPT-04: CALLBACK ANTIGO / TARDIO
  // =========================================================================
  console.log('\n=========================================================================');
  console.log('TG-ACCEPT-04: CALLBACK ANTIGO APÓS ROTA JÁ ACEITA');
  console.log('=========================================================================');

  // Driver C tenta enviar callback tardio com versão 1 para a rota já aceita por A
  const lateAttempt = await routeService.acceptRoute(route01.id, {
    driverId: driverC.id,
    expectedVersion: 1,
  });

  if (lateAttempt.status !== 'LOST' && lateAttempt.status !== 'REJECTED') {
    throw new Error(`TG-ACCEPT-04 FALHOU: Callback tardio deveria retornar LOST ou REJECTED, obteve ${lateAttempt.status}`);
  }

  // Garantir que a rota no banco NÃO sofreu mutação
  const intactRoute01 = await routeService.getRouteById(route01.id);
  if (intactRoute01?.accepted_driver_id !== driverA.id) {
    throw new Error(`TG-ACCEPT-04 FALHOU: Banco foi indevidamente modificado pelo callback tardio!`);
  }

  console.log('✅ TG-ACCEPT-04 PASSOU: Callback tardio rejeitado fail-closed sem mutação no banco e sem segundo vencedor.');

  // =========================================================================
  // TG-ACCEPT-05: PERSISTÊNCIA E UTILIZAÇÃO DE TELEGRAM_MESSAGE_ID
  // =========================================================================
  console.log('\n=========================================================================');
  console.log('TG-ACCEPT-05: INTEGRIDADE DO TELEGRAM_MESSAGE_ID');
  console.log('=========================================================================');

  apiCalls.length = 0;
  const route05 = await createAndPublishTestRoute('05');

  // Buscar dispatches no banco
  const dispatches = await db
    .select()
    .from(routeOfferDispatches)
    .where(eq(routeOfferDispatches.route_id, route05.id));

  const dispB = dispatches.find((d) => d.driver_id === driverB.id);
  if (!dispB || !dispB.telegram_message_id) {
    throw new Error(`TG-ACCEPT-05 FALHOU: telegram_message_id não foi persistido para o motorista B em routeOfferDispatches`);
  }

  const expectedMsgIdB = parseInt(dispB.telegram_message_id, 10);

  // Driver A aceita a rota
  apiCalls.length = 0;
  await routeService.acceptRoute(route05.id, { driverId: driverA.id });

  // Verificar chamada de editMessageText para driver B
  const editB = apiCalls.find(
    (c) => c.method === 'editMessageText' && c.body.chat_id === driverB.telegram_chat_id
  );

  if (!editB) {
    throw new Error(`TG-ACCEPT-05 FALHOU: editMessageText não foi chamado para o motorista B`);
  }

  if (editB.body.message_id !== expectedMsgIdB) {
    throw new Error(
      `TG-ACCEPT-05 FALHOU: message_id usado na invalidação (${editB.body.message_id}) difere do gravado no banco (${expectedMsgIdB})`
    );
  }

  console.log(`✅ TG-ACCEPT-05 PASSOU: message_id #${expectedMsgIdB} gravado em routeOfferDispatches foi exatamente o consumido na invalidação.`);

  // =========================================================================
  // TG-ACCEPT-06: RESILIÊNCIA A FALHA TELEGRAM & FALLBACK
  // =========================================================================
  console.log('\n=========================================================================');
  console.log('TG-ACCEPT-06: FALHA NA API TELEGRAM — RESILIÊNCIA E FALLBACK');
  console.log('=========================================================================');

  apiCalls.length = 0;
  const route06 = await createAndPublishTestRoute('06');

  // Simular falha na API Telegram para editMessageText
  forceEditFailure = true;
  apiCalls.length = 0;

  let acceptError: any = null;
  let acceptResult06: any = null;
  try {
    acceptResult06 = await routeService.acceptRoute(route06.id, { driverId: driverA.id });
  } catch (err: any) {
    acceptError = err;
  }

  forceEditFailure = false;

  if (acceptError) {
    throw new Error(`TG-ACCEPT-06 FALHOU: Falha no Telegram reverteu o aceite da rota! Erro: ${acceptError.message}`);
  }

  if (acceptResult06?.status !== 'WON') {
    throw new Error(`TG-ACCEPT-06 FALHOU: Motorista A deveria ser WON mesmo com erro no Telegram, obteve ${acceptResult06?.status}`);
  }

  // Provar que o banco registrou o vencedor
  const dbRoute06 = await routeService.getRouteById(route06.id);
  if (dbRoute06?.status !== 'ACCEPTED' || dbRoute06.accepted_driver_id !== driverA.id) {
    throw new Error(`TG-ACCEPT-06 FALHOU: Vencedor não foi persistido no banco`);
  }

  // Provar que o fallback foi executado: enviou mensagem curta de aviso para o perdedor
  const fallbackMessages = apiCalls.filter(
    (c) =>
      c.method === 'sendMessage' &&
      (c.body.chat_id === driverB.telegram_chat_id || c.body.chat_id === driverC.telegram_chat_id) &&
      c.body.text.includes('já foi aceita por outro motorista')
  );

  if (fallbackMessages.length === 0) {
    throw new Error(`TG-ACCEPT-06 FALHOU: Fallback de notificação curta não foi disparado após falha no editMessageText`);
  }

  console.log('✅ TG-ACCEPT-06 PASSOU: Aceite preservado com 100% de integridade no banco e fallback de notificação executado.');

  console.log('\n=========================================================================');
  console.log('🎉 TODOS OS TESTES TG-ACCEPT (01 A 06) FORAM HOMOLOGADOS COM SUCESSO!');
  console.log('=========================================================================');
}

runTgAcceptSuite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ ERRO NA SUÍTE TG-ACCEPT:', err);
    process.exit(1);
  });
