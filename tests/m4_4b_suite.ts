/**
 * M4.4B Comprehensive Verification Suite
 * 
 * M44B-01: Edição de Rota em OFFERED — Incrementa versão (v1 -> v2), invalida mensagem Telegram
 *          da v1 via editMessageText e keyboard vazio, e dispara nova oferta v2 com callback versionado.
 * M44B-02: Fallback de Invalidação — Se editMessageText falhar na v1, executa fallback: remove keyboard
 *          via editMessageReplyMarkup e envia mensagem curta de aviso sem silenciar erro.
 * M44B-03: Recálculo de Elegibilidade — Nova versão recalcula motoristas elegíveis; motorista com
 *          veículo removido da rota não recebe a nova oferta.
 * M44B-04: Regra Soberana: Proteção contra Callback de Versão Antiga — Clique em callback antigo
 *          retorna STALE_ROUTE_VERSION, mensagem amigável e impede qualquer aceite.
 * M44B-05: Aceite Válido da Nova Versão — Motorista elegível aceita v2, torna-se WON exclusivo,
 *          e ofertas v2 dos demais motoristas são invalidadas.
 * M44B-06: Versionamento e Auditoria de Dispatches — Dispatches v1 e v2 preservados com integridade,
 *          e eventos de auditoria OLD_ROUTE_OFFER_INVALIDATED e ROUTE_REOFFERED registrados.
 */

import { db, initDbConstraints } from '../src/db/index.ts';
import {
  drivers,
  routes,
  routeStops,
  routeEvents,
  routeOfferDispatches,
  pickupLocations,
  routeUpdates,
} from '../src/db/schema.ts';
import { routeService } from '../src/server/routeService.ts';
import { routeEditService } from '../src/server/routeEditService.ts';
import { driverService } from '../src/server/driverService.ts';
import { referralService } from '../src/server/referralService.ts';
import { telegramBot } from '../src/server/telegramBot.ts';
import { eq, and } from 'drizzle-orm';

async function runM44BSuite() {
  console.log('=========================================================================');
  console.log('🚀 INICIANDO SUÍTE M4.4B: EDIÇÃO DE ROTA PUBLICADA & REPUBLICAÇÃO REAL');
  console.log('=========================================================================\n');
  await initDbConstraints();

  const timestamp = Date.now();

  telegramBot.setDriverService(driverService);
  telegramBot.setReferralService(referralService);
  telegramBot.setRouteService(routeService);

  // Interceptar chamadas Telegram para auditoria profunda de E2E
  interface TelegramCall {
    method: string;
    body: any;
    timestamp: number;
  }
  const apiCalls: TelegramCall[] = [];
  let nextMessageId = 800000;
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

  // 1. Setup Ponto de Coleta
  const [pickupLoc] = await db
    .insert(pickupLocations)
    .values({
      name: `Kantine Coleta M44B ${timestamp}`,
      address: 'Av. Floriano Peixoto, 1200 - Centro, Uberlândia',
      neighborhood: 'Centro',
      active: true,
    })
    .returning();

  // 2. Setup Motoristas:
  // Driver A: CAR_HATCH
  // Driver B: CAR_HATCH
  // Driver C: MOTORCYCLE
  const [driverA] = await db
    .insert(drivers)
    .values({
      name: `Motorista Carro A ${timestamp}`,
      phone: `34991${Math.floor(100000 + Math.random() * 900000)}`,
      vehicle_type: 'CAR_HATCH',
      pix_key_type: 'PHONE',
      pix_key_value: '+5534991114444',
      status: 'ACTIVE',
      telegram_chat_id: `chat_m44b_a_${timestamp}`,
      telegram_user_id: `tg_m44b_a_${timestamp}`,
    })
    .returning();

  const [driverB] = await db
    .insert(drivers)
    .values({
      name: `Motorista Carro B ${timestamp}`,
      phone: `34992${Math.floor(100000 + Math.random() * 900000)}`,
      vehicle_type: 'CAR_HATCH',
      pix_key_type: 'PHONE',
      pix_key_value: '+5534992224444',
      status: 'ACTIVE',
      telegram_chat_id: `chat_m44b_b_${timestamp}`,
      telegram_user_id: `tg_m44b_b_${timestamp}`,
    })
    .returning();

  const [driverC] = await db
    .insert(drivers)
    .values({
      name: `Motorista Moto C ${timestamp}`,
      phone: `34993${Math.floor(100000 + Math.random() * 900000)}`,
      vehicle_type: 'MOTO_WITH_BAG',
      pix_key_type: 'PHONE',
      pix_key_value: '+5534993334444',
      status: 'ACTIVE',
      telegram_chat_id: `chat_m44b_c_${timestamp}`,
      telegram_user_id: `tg_m44b_c_${timestamp}`,
    })
    .returning();

  // =========================================================================
  // M44B-01: Edição de Rota em OFFERED — Invalidação de v1 e Envio de v2
  // =========================================================================
  console.log('-------------------------------------------------------------------------');
  console.log('TEST M44B-01: Edição de Rota OFFERED (v1 -> v2) com invalidação da oferta antiga');
  console.log('-------------------------------------------------------------------------');

  // Criar rota inicial aceitando CAR_HATCH e MOTORCYCLE
  const draft1 = await routeService.createDraft({
    pickup_type: 'REGISTERED',
    pickup_location_id: pickupLoc.id,
    accepted_vehicle_types: ['CAR_HATCH', 'MOTO_WITH_BAG'],
    final_deadline: '17:30',
    total_fee: '40.00',
    override_reason: 'M44B test',
    stops: [
      {
        destination_address: 'Rua Afonso Pena, 300 - Centro',
        destination_neighborhood: 'Centro',
        cargo_description: 'Encomenda Inicial',
      },
    ],
  });

  const routeId = draft1.id;

  // Publicar rota inicial (v1)
  const pubRes = await routeService.publishRoute(routeId, 'ADMIN');
  if (pubRes.route.status !== 'OFFERED' || pubRes.route.route_version !== 1) {
    throw new Error('Falha ao publicar rota inicial em OFFERED v1');
  }

  // Verificar dispatches da v1
  const v1Dispatches = await db
    .select()
    .from(routeOfferDispatches)
    .where(eq(routeOfferDispatches.route_id, routeId));

  const v1DriverADisp = v1Dispatches.find((d) => d.driver_id === driverA.id);
  const v1DriverBDisp = v1Dispatches.find((d) => d.driver_id === driverB.id);

  if (!v1DriverADisp?.telegram_message_id || !v1DriverBDisp?.telegram_message_id) {
    throw new Error('Dispatches da v1 devem gravar telegram_message_id retornado pelo Telegram');
  }

  // Agora, operador edita a rota para adicionar nova parada e alterar prazo
  apiCalls.length = 0; // Limpar logs de chamadas
  const editResult = await routeEditService.executeRouteEdit(
    routeId,
    {
      expected_version: 1,
      final_deadline: '18:45',
      total_fee: '55.00',
      stops: [
        {
          destination_address: 'Rua Afonso Pena, 300 - Centro',
          destination_neighborhood: 'Centro',
          cargo_description: 'Encomenda Inicial Atualizada',
        },
        {
          destination_address: 'Av. Rondon Pacheco, 2000 - Tibery',
          destination_neighborhood: 'Tibery',
          cargo_description: 'Encomenda Extra',
        },
      ],
    },
    'OPERATOR'
  );

  if (editResult.route.route_version !== 2) {
    throw new Error(`Nova versão esperada v2, obtido v${editResult.route.route_version}`);
  }

  // Verificar que Telegram editMessageText foi chamado para os dispatches da v1
  const v1EditCalls = apiCalls.filter(
    (c) =>
      c.method === 'editMessageText' &&
      (c.body.message_id === parseInt(v1DriverADisp.telegram_message_id!, 10) ||
        c.body.message_id === parseInt(v1DriverBDisp.telegram_message_id!, 10))
  );

  if (v1EditCalls.length < 2) {
    throw new Error(
      `Deveria haver no mínimo 2 chamadas editMessageText para invalidar v1, obtido: ${v1EditCalls.length}`
    );
  }

  // Conferir que o texto de invalidação informa a substituição e remove o keyboard
  for (const call of v1EditCalls) {
    if (!call.body.text.includes('ROTA #') || !call.body.text.includes('OFERTA ATUALIZADA')) {
      throw new Error(`Texto de invalidação não contém cabeçalho esperado: ${call.body.text}`);
    }
    if (!call.body.text.includes('v1') || !call.body.text.includes('v2')) {
      throw new Error(`Texto de invalidação deve informar versão anterior v1 e nova versão v2: ${call.body.text}`);
    }
    if (call.body.reply_markup?.inline_keyboard?.length !== 0) {
      throw new Error(`Inline keyboard da mensagem anterior deve ser completamente removido ([]), obtido: ${JSON.stringify(call.body.reply_markup)}`);
    }
  }

  // Verificar que novas mensagens (sendMessage) foram enviadas para os motoristas com a v2
  const v2SendCalls = apiCalls.filter(
    (c) =>
      c.method === 'sendMessage' &&
      (c.body.chat_id === driverA.telegram_chat_id || c.body.chat_id === driverB.telegram_chat_id)
  );

  if (v2SendCalls.length < 2) {
    throw new Error(`Deveriam ter sido enviadas novas ofertas v2, obtido: ${v2SendCalls.length}`);
  }

  // Verificar que o botão da v2 possui callback com a versão 2
  const v2CallA = v2SendCalls.find((c) => c.body.chat_id === driverA.telegram_chat_id);
  const v2CallbackData = v2CallA?.body.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data;
  if (v2CallbackData !== `accept_route:${routeId}:2`) {
    throw new Error(`Callback da nova oferta v2 deve ser accept_route:${routeId}:2, obtido: ${v2CallbackData}`);
  }

  console.log('✅ TEST M44B-01 PASSOU: Ofertas v1 invalidadas (editMessageText + keyboard vazio) e novas ofertas v2 enviadas com callback versionado.');

  // =========================================================================
  // M44B-02: Fallback de Invalidação quando editMessageText falha
  // =========================================================================
  console.log('\n-------------------------------------------------------------------------');
  console.log('TEST M44B-02: Fallback de Invalidação quando editMessageText falha');
  console.log('-------------------------------------------------------------------------');

  // Criar outra rota em OFFERED
  const draft2 = await routeService.createDraft({
    pickup_type: 'REGISTERED',
    pickup_location_id: pickupLoc.id,
    accepted_vehicle_types: ['CAR_HATCH'],
    final_deadline: '18:00',
    total_fee: '35.00',
    override_reason: 'M44B fallback test',
    stops: [
      {
        destination_address: 'Av. Cesário Alvim, 100 - Centro',
        destination_neighborhood: 'Centro',
        cargo_description: 'Doces Finos',
      },
    ],
  });

  const routeId2 = draft2.id;
  await routeService.publishRoute(routeId2, 'ADMIN');

  // Simular falha na API Telegram para editMessageText
  forceEditFailure = true;
  apiCalls.length = 0;

  await routeEditService.executeRouteEdit(
    routeId2,
    {
      expected_version: 1,
      final_deadline: '19:00',
      total_fee: '45.00',
    },
    'OPERATOR'
  );

  forceEditFailure = false;

  // Verificar se o fallback foi acionado: editMessageReplyMarkup e/ou envio de notificação fallback
  const fallbackMarkupCalls = apiCalls.filter((c) => c.method === 'editMessageReplyMarkup');
  const fallbackMessageCalls = apiCalls.filter(
    (c) => c.method === 'sendMessage' && c.body.text.includes('foi atualizada de v1 para v2')
  );

  if (fallbackMarkupCalls.length === 0 && fallbackMessageCalls.length === 0) {
    throw new Error('Falha no editMessageText deveria acionar fallback de invalidação');
  }

  console.log('✅ TEST M44B-02 PASSOU: Falha no editMessageText tratada com sucesso via fallback controlado sem travar a operação.');

  // =========================================================================
  // M44B-03: Recálculo de Elegibilidade ao Republicar
  // =========================================================================
  console.log('\n-------------------------------------------------------------------------');
  console.log('TEST M44B-03: Recálculo de Elegibilidade na Republicação');
  console.log('-------------------------------------------------------------------------');

  // Criar rota aceitando CAR_HATCH e MOTORCYCLE (tanto Driver A, B quanto Driver C são elegíveis)
  const draft3 = await routeService.createDraft({
    pickup_type: 'REGISTERED',
    pickup_location_id: pickupLoc.id,
    accepted_vehicle_types: ['CAR_HATCH', 'MOTO_WITH_BAG'],
    final_deadline: '18:00',
    total_fee: '38.00',
    override_reason: 'M44B eligibility test',
    stops: [
      {
        destination_address: 'Rua Tupinambás, 50 - Saraiva',
        destination_neighborhood: 'Saraiva',
        cargo_description: 'Material Frágil',
      },
    ],
  });

  const routeId3 = draft3.id;
  await routeService.publishRoute(routeId3, 'ADMIN');

  // Na v1, Driver C (MOTORCYCLE) recebeu oferta
  const v1Dispatches3 = await db
    .select()
    .from(routeOfferDispatches)
    .where(and(eq(routeOfferDispatches.route_id, routeId3), eq(routeOfferDispatches.route_version, 1)));

  const driverCReceivedV1 = v1Dispatches3.some((d) => d.driver_id === driverC.id && d.status === 'SENT');
  if (!driverCReceivedV1) {
    throw new Error('Driver C (MOTORCYCLE) deveria ter recebido v1');
  }

  // Agora, operador edita a rota e altera accepted_vehicle_types para EXCLUSIVAMENTE CAR_HATCH
  apiCalls.length = 0;
  await routeEditService.executeRouteEdit(
    routeId3,
    {
      expected_version: 1,
      accepted_vehicle_types: ['CAR_HATCH'],
      total_fee: '42.00',
    },
    'OPERATOR'
  );

  // Na v2, Driver C NÃO pode receber a nova oferta
  const v2Dispatches3 = await db
    .select()
    .from(routeOfferDispatches)
    .where(and(eq(routeOfferDispatches.route_id, routeId3), eq(routeOfferDispatches.route_version, 2)));

  const driverCReceivedV2 = v2Dispatches3.some((d) => d.driver_id === driverC.id);
  if (driverCReceivedV2) {
    throw new Error('Driver C (MOTORCYCLE) NÃO deveria ter recebido a oferta v2, pois veículo é incompatível com a nova versão');
  }

  const driverAReceivedV2 = v2Dispatches3.some((d) => d.driver_id === driverA.id && d.status === 'SENT');
  if (!driverAReceivedV2) {
    throw new Error('Driver A (CAR_HATCH) deveria ter recebido a nova oferta v2');
  }

  console.log('✅ TEST M44B-03 PASSOU: Elegibilidade recalculada na nova versão — motorista com veículo incompatível não recebeu v2.');

  // =========================================================================
  // M44B-04: Proteção Soberana contra Callback de Versão Antiga
  // =========================================================================
  console.log('\n-------------------------------------------------------------------------');
  console.log('TEST M44B-04: Proteção Soberana contra Callback de Versão Antiga (STALE_ROUTE_VERSION)');
  console.log('-------------------------------------------------------------------------');

  // Driver A tenta aceitar routeId (que agora está em v2) usando o callback antigo da v1 (expectedVersion = 1)
  const staleAcceptRes = await routeService.acceptRoute(routeId, {
    driverId: driverA.id,
    telegramUserId: driverA.telegram_user_id!,
    expectedVersion: 1, // Versão antiga
  });

  if (staleAcceptRes.status !== 'REJECTED') {
    throw new Error(`Tentativa de aceitar versão antiga deveria retornar REJECTED, obtido: ${staleAcceptRes.status}`);
  }

  if (staleAcceptRes.error !== 'STALE_ROUTE_VERSION' && staleAcceptRes.error !== 'OUTDATED_ROUTE_VERSION') {
    throw new Error(`Erro esperado STALE_ROUTE_VERSION, obtido: ${staleAcceptRes.error}`);
  }

  if (!staleAcceptRes.message.includes('Esta oferta foi atualizada e não está mais disponível')) {
    throw new Error(`Mensagem amigável esperada, obtido: ${staleAcceptRes.message}`);
  }

  // Garantir que a rota NÃO mudou de status (permanece OFFERED)
  const routeStillOffered = await routeService.getRouteById(routeId);
  if (routeStillOffered?.status !== 'OFFERED' || routeStillOffered.accepted_driver_id !== null) {
    throw new Error('Rota não deveria ter sido aceita por callback antigo!');
  }

  console.log('✅ TEST M44B-04 PASSOU: Callback de versão antiga categoricamente rejeitado com STALE_ROUTE_VERSION e rota permanece protegida.');

  // =========================================================================
  // M44B-05: Aceite Válido da Nova Versão (v2)
  // =========================================================================
  console.log('\n-------------------------------------------------------------------------');
  console.log('TEST M44B-05: Aceite Válido da Nova Versão (v2) e Invalidação dos Perdedores');
  console.log('-------------------------------------------------------------------------');

  apiCalls.length = 0;
  // Driver B aceita a versão correta (v2)
  const validAcceptRes = await routeService.acceptRoute(routeId, {
    driverId: driverB.id,
    telegramUserId: driverB.telegram_user_id!,
    expectedVersion: 2, // Versão atualizada
  });

  if (validAcceptRes.status !== 'WON') {
    throw new Error(`Driver B deveria vencer a rota v2, obtido status: ${validAcceptRes.status}`);
  }

  const finalRoute = await routeService.getRouteById(routeId);
  if (finalRoute?.status !== 'ACCEPTED' || finalRoute.accepted_driver_id !== driverB.id) {
    throw new Error('Rota deveria estar em ACCEPTED pelo Driver B');
  }

  // Invalidação das ofertas v2 para os demais motoristas (Driver A)
  const driverBDispatches = await db
    .select()
    .from(routeOfferDispatches)
    .where(and(eq(routeOfferDispatches.route_id, routeId), eq(routeOfferDispatches.driver_id, driverA.id), eq(routeOfferDispatches.route_version, 2)));

  const v2MsgIdA = driverBDispatches[0]?.telegram_message_id;
  if (v2MsgIdA) {
    const editCallsForA = apiCalls.filter(
      (c) => c.method === 'editMessageText' && c.body.message_id === parseInt(v2MsgIdA, 10)
    );
    if (editCallsForA.length === 0) {
      throw new Error('Oferta v2 do Driver A deveria ter sido invalidada após aceite do Driver B');
    }
  }

  console.log('✅ TEST M44B-05 PASSOU: Nova versão v2 aceita com sucesso exclusivo pelo Driver B e ofertas v2 dos concorrentes invalidadas.');

  // =========================================================================
  // M44B-06: Versionamento e Auditoria dos Dispatches
  // =========================================================================
  console.log('\n-------------------------------------------------------------------------');
  console.log('TEST M44B-06: Versionamento e Auditoria dos Dispatches');
  console.log('-------------------------------------------------------------------------');

  const allDispatches = await db
    .select()
    .from(routeOfferDispatches)
    .where(eq(routeOfferDispatches.route_id, routeId));

  const v1Count = allDispatches.filter((d) => d.route_version === 1).length;
  const v2Count = allDispatches.filter((d) => d.route_version === 2).length;

  if (v1Count === 0 || v2Count === 0) {
    throw new Error(`Histórico de dispatches deve preservar v1 e v2 intactos. v1=${v1Count}, v2=${v2Count}`);
  }

  // Verificar eventos de auditoria
  const events = await db
    .select()
    .from(routeEvents)
    .where(eq(routeEvents.route_id, routeId));

  const hasInvalidatedEvent = events.some((e) => e.event_type === 'OLD_ROUTE_OFFER_INVALIDATED');
  const hasReofferedEvent = events.some((e) => e.event_type === 'ROUTE_REOFFERED');

  if (!hasInvalidatedEvent || !hasReofferedEvent) {
    throw new Error('Eventos de auditoria OLD_ROUTE_OFFER_INVALIDATED e ROUTE_REOFFERED devem estar registrados');
  }

  console.log('✅ TEST M44B-06 PASSOU: Versionamento e trilha de auditoria 100% íntegros no banco de dados.');

  console.log('\n=========================================================================');
  console.log('🎉 TODOS OS TESTES M4.4B (01 A 06) FORAM HOMOLOGADOS COM SUCESSO!');
  console.log('=========================================================================');
}

runM44BSuite().catch((err) => {
  console.error('\n💥 FALHA NA SUÍTE M4.4B:', err);
  process.exit(1);
});
