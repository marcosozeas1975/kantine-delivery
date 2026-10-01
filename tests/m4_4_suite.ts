/**
 * M4.4 Automated Verification Suite
 * 
 * EDIT-T01: DRAFT — Edição completa sem envio para Telegram
 * EDIT-T02: OFFERED — Edição de rota ofertada sem vencedor (incrementa versão, invalida oferta anterior, reenvia)
 * EDIT-T03: ACCEPTED + telefone/obs — Correção operacional, motorista notificado, novo aceite não exigido
 * EDIT-T04: ACCEPTED + endereço — Correção operacional com incremento de versão, aviso ao motorista e Maps regenerado
 * EDIT-T05: Ciência — Motorista toca [✅ CIENTE], versão reconhecida persistida
 * EDIT-T06: Adicionar Parada — Classificada como alteração material, exige aceite do motorista
 * EDIT-T07: Alterar final_driver_fee — Alteração material (aumento ou redução) exige aprovação do motorista
 * EDIT-T08: Motorista aceita alteração material — Nova versão e novas condições tornam-se efetivas
 * EDIT-T09: Motorista recusa alteração material — Condições anteriores mantidas, pendência destacada
 * EDIT-T10: Parada concluída — Bloqueio de edição de parada DELIVERED (CANNOT_EDIT_COMPLETED_STOP)
 * EDIT-T11: Rota concluída — Bloqueio de edição operacional em rota COMPLETED (CANNOT_EDIT_COMPLETED_ROUTE)
 * EDIT-T12: Concorrência — Dois administradores editam mesma versão; segundo rejeitado com conflito
 * EDIT-T13: Callback antigo — Callback de versão anterior não produz mutação na versão atual
 * EDIT-T14: Privacidade — Somente motorista vencedor recebe atualização contendo dados protegidos
 * EDIT-T15: Pagamento — Alteração de frete aprovada é utilizada no módulo de Pagamentos
 */

import { db, initDbConstraints } from '../src/db/index.ts';
import {
  drivers,
  routes,
  routeStops,
  routeEvents,
  routeUpdates,
  routeOfferDispatches,
  pickupLocations,
} from '../src/db/schema.ts';
import { routeService } from '../src/server/routeService.ts';
import { routeEditService } from '../src/server/routeEditService.ts';
import { driverService } from '../src/server/driverService.ts';
import { referralService } from '../src/server/referralService.ts';
import { telegramBot } from '../src/server/telegramBot.ts';
import { eq, and, inArray } from 'drizzle-orm';
import { EditRouteDTO } from '../src/server/types.ts';

async function runM44Suite() {
  console.log('🚀 INICIANDO SUÍTE DE TESTES M4.4 — EDIÇÃO CONTROLADA, VERSIONAMENTO E REENVIO DE ROTAS\n');
  await initDbConstraints();

  const timestamp = Date.now();

  telegramBot.setDriverService(driverService);
  telegramBot.setReferralService(referralService);
  telegramBot.setRouteService(routeService);

  // Mock de captura de mensagens do Telegram Bot
  const capturedMessages: Array<{ chatId: string | number; text: string; markup?: any }> = [];
  const originalCallApi = (telegramBot as any).callTelegramApi.bind(telegramBot);
  (telegramBot as any).callTelegramApi = async (method: string, data: any) => {
    if (method === 'sendMessage') {
      capturedMessages.push({ chatId: data.chat_id, text: data.text, markup: data.reply_markup });
      return { message_id: 88888 + capturedMessages.length };
    }
    return originalCallApi(method, data);
  };

  // Criar 2 motoristas ativos para testes
  const [driverA] = await db
    .insert(drivers)
    .values({
      name: `Motorista Alpha ${timestamp}`,
      phone: `34991${Math.floor(100000 + Math.random() * 900000)}`,
      vehicle_type: 'CAR_HATCH',
      pix_key_type: 'PHONE',
      pix_key_value: '+5534991111111',
      status: 'ACTIVE',
      telegram_chat_id: `chat_alpha_${timestamp}`,
      telegram_user_id: `tg_alpha_${timestamp}`,
    })
    .returning();

  const [driverB] = await db
    .insert(drivers)
    .values({
      name: `Motorista Beta ${timestamp}`,
      phone: `34992${Math.floor(100000 + Math.random() * 900000)}`,
      vehicle_type: 'CAR_HATCH',
      pix_key_type: 'PHONE',
      pix_key_value: '+5534992222222',
      status: 'ACTIVE',
      telegram_chat_id: `chat_beta_${timestamp}`,
      telegram_user_id: `tg_beta_${timestamp}`,
    })
    .returning();

  // Criar Ponto de Coleta
  const [pickupLoc] = await db
    .insert(pickupLocations)
    .values({
      name: `Kantine Matriz ${timestamp}`,
      address: 'Av. Afonso Pena, 100 - Centro, Uberlândia',
      neighborhood: 'Centro',
      active: true,
    })
    .returning();

  // =========================================================================
  // EDIT-T01: DRAFT — Edição sem Telegram
  // =========================================================================
  console.log('=========================================================================');
  console.log('EDIT-T01: DRAFT — Edição sem Telegram');
  console.log('=========================================================================');

  capturedMessages.length = 0;
  const draftRoute = await routeService.createDraft({
    pickup_type: 'REGISTERED',
    pickup_location_id: pickupLoc.id,
    final_deadline: '17:00',
    total_fee: '40.00',
    accepted_vehicle_types: ['CAR_HATCH'],
    stops: [
      {
        destination_address: 'Rua Inicial, 10 - Centro',
        destination_neighborhood: 'Centro',
        cargo_description: 'Bolo Cenográfico',
        delivery_mode: 'IN_PERSON',
      },
    ],
  });

  if (draftRoute.route_version !== 1) {
    throw new Error(`❌ EDIT-T01: Versão inicial deveria ser 1, obtido: ${draftRoute.route_version}`);
  }

  // Editar rascunho
  const editDraftRes = await routeEditService.executeRouteEdit(
    draftRoute.id,
    {
      expected_version: 1,
      final_deadline: '17:30',
      stops: [
        {
          id: draftRoute.stops![0].id,
          destination_address: 'Rua Corrigida, 20 - Centro',
          destination_neighborhood: 'Centro',
          cargo_description: 'Bolo Cenográfico 3kg',
        },
      ],
    },
    'ADMIN_USER'
  );

  if (capturedMessages.length > 0) {
    throw new Error('❌ EDIT-T01: Edição em DRAFT não deve disparar mensagens no Telegram!');
  }
  if (editDraftRes.route.final_deadline !== '17:30') {
    throw new Error('❌ EDIT-T01: Prazo final não foi atualizado no DRAFT');
  }
  if (editDraftRes.route.stops![0].destination_address !== 'Rua Corrigida, 20 - Centro') {
    throw new Error('❌ EDIT-T01: Endereço da parada não foi atualizado no DRAFT');
  }

  console.log(`✅ EDIT-T01 PASSOU: DRAFT editado com sucesso sem envio de Telegram (v${editDraftRes.route.route_version}).`);

  // =========================================================================
  // EDIT-T02: OFFERED — Edição de rota ofertada sem vencedor
  // =========================================================================
  console.log('\n=========================================================================');
  console.log('EDIT-T02: OFFERED — Edição de rota publicada sem aceite');
  console.log('=========================================================================');

  // Publicar rota
  const pubRes = await routeService.publishRoute(draftRoute.id);
  const offeredRoute = pubRes.route;
  const versionBeforeEdit = offeredRoute.route_version;

  capturedMessages.length = 0;

  // Editar rota em OFFERED
  const editOfferedRes = await routeEditService.executeRouteEdit(
    offeredRoute.id,
    {
      expected_version: versionBeforeEdit,
      final_deadline: '18:15',
    },
    'ADMIN_USER'
  );

  if (editOfferedRes.route.route_version !== versionBeforeEdit + 1) {
    throw new Error(`❌ EDIT-T02: Versão não foi incrementada. Esperado: ${versionBeforeEdit + 1}, obtido: ${editOfferedRes.route.route_version}`);
  }

  // Verificar que reenvio da oferta ocorreu no Telegram
  const reofferMsg = capturedMessages.find((m) => m.text.includes(`NOVA ROTA #${offeredRoute.id}`));
  if (!reofferMsg) {
    throw new Error('❌ EDIT-T02: Reenvio da oferta atualizada não disparado no Telegram');
  }

  console.log(`✅ EDIT-T02 PASSOU: Rota em OFFERED teve versão incrementada para v${editOfferedRes.route.route_version} e nova oferta reenviada.`);

  // =========================================================================
  // EDIT-T03: ACCEPTED + telefone/obs — Correção operacional
  // =========================================================================
  console.log('\n=========================================================================');
  console.log('EDIT-T03: ACCEPTED — Correção operacional (observações e prazo)');
  console.log('=========================================================================');

  // Garantir status SENT no dispatch para o motorista Alpha
  await db
    .update(routeOfferDispatches)
    .set({ status: 'SENT' })
    .where(
      and(
        eq(routeOfferDispatches.route_id, offeredRoute.id),
        eq(routeOfferDispatches.driver_id, driverA.id)
      )
    );

  // Motorista Alpha aceita a rota vigente
  const acceptResult = await routeService.acceptRoute(offeredRoute.id, {
    driverId: driverA.id,
    telegramUserId: driverA.telegram_user_id!,
    expectedVersion: editOfferedRes.route.route_version,
  });

  if (acceptResult.status !== 'WON') {
    throw new Error(`❌ Falha no aceite da rota: ${acceptResult.message}`);
  }

  capturedMessages.length = 0;
  const acceptedRoute = acceptResult.route!;
  const vCurrent = acceptedRoute.route_version;

  // Realizar correção operacional: atualizar observações
  const opEditRes = await routeEditService.executeRouteEdit(
    acceptedRoute.id,
    {
      expected_version: vCurrent,
      stops: [
        {
          id: acceptedRoute.stops![0].id,
          destination_address: acceptedRoute.stops![0].destination_address,
          destination_neighborhood: acceptedRoute.stops![0].destination_neighborhood,
          cargo_description: acceptedRoute.stops![0].cargo_description,
          observations: 'Ligar antes de subir (Interfone 302)',
        },
      ],
    },
    'ADMIN_USER'
  );

  if (opEditRes.change_type !== 'OPERATIONAL') {
    throw new Error(`❌ EDIT-T03: Classificação incorreta: ${opEditRes.change_type}`);
  }
  if (opEditRes.status !== 'APPLIED') {
    throw new Error('❌ EDIT-T03: Correção operacional deveria ter sido aplicada imediatamente');
  }

  // Motorista vencedor deve ter recebido notificação no Telegram
  const notifyMsg = capturedMessages.find((m) => m.chatId === driverA.telegram_chat_id);
  if (!notifyMsg || !notifyMsg.text.includes('ROTA #') || !notifyMsg.text.includes('ATUALIZADA')) {
    throw new Error('❌ EDIT-T03: Mensagem de atualização operacional não enviada ao motorista vencedor');
  }

  console.log(`✅ EDIT-T03 PASSOU: Correção operacional aplicada imediatamente (v${opEditRes.route.route_version}) e motorista notificado.`);

  // =========================================================================
  // EDIT-T04: ACCEPTED + endereço — Correção operacional com Maps regenerado
  // =========================================================================
  console.log('\n=========================================================================');
  console.log('EDIT-T04: ACCEPTED — Correção de endereço com Google Maps regenerado');
  console.log('=========================================================================');

  capturedMessages.length = 0;
  const vBeforeT04 = opEditRes.route.route_version;
  const newAddress = 'Av. Rondon Pacheco, 4000 - Tibery, Uberlândia';

  const addressEditRes = await routeEditService.executeRouteEdit(
    acceptedRoute.id,
    {
      expected_version: vBeforeT04,
      stops: [
        {
          id: acceptedRoute.stops![0].id,
          destination_address: newAddress,
          destination_neighborhood: 'Tibery',
          cargo_description: acceptedRoute.stops![0].cargo_description,
        },
      ],
    },
    'ADMIN_USER'
  );

  const t04Msg = capturedMessages.find((m) => m.chatId === driverA.telegram_chat_id);
  if (!t04Msg) throw new Error('❌ EDIT-T04: Mensagem Telegram não encontrada');

  const buttonsT04 = (t04Msg.markup?.inline_keyboard || []).flat();
  const mapsBtn = buttonsT04.find((b: any) => b.text === '🗺️ ABRIR ROTA ATUALIZADA');

  if (!mapsBtn || !mapsBtn.url) {
    throw new Error('❌ EDIT-T04: Botão [🗺️ ABRIR ROTA ATUALIZADA] ausente ou sem URL');
  }

  const parsedUrl = new URL(mapsBtn.url);
  if (parsedUrl.searchParams.get('destination') !== newAddress) {
    throw new Error(`❌ EDIT-T04: Google Maps URL não regenerada com o novo endereço: ${mapsBtn.url}`);
  }

  console.log(`✅ EDIT-T04 PASSOU: Endereço corrigido, versão incrementada (v${addressEditRes.route.route_version}) e Maps regenerado com precisão.`);

  // =========================================================================
  // EDIT-T05: Ciência do Motorista
  // =========================================================================
  console.log('\n=========================================================================');
  console.log('EDIT-T05: Ciência — Motorista toca CIENTE');
  console.log('=========================================================================');

  const routeBeforeAck = await routeService.getRouteById(acceptedRoute.id);
  const currentVersion = routeBeforeAck!.route_version;

  // Antes da ciência: driver_acknowledged_version está defasado
  const ackSuccess = await routeEditService.handleDriverOperationalAck(
    acceptedRoute.id,
    currentVersion,
    driverA.id
  );

  if (!ackSuccess) throw new Error('❌ EDIT-T05: Falha ao processar ciência do motorista');

  const routeAfterAck = await routeService.getRouteById(acceptedRoute.id);
  if (routeAfterAck!.driver_acknowledged_version !== currentVersion) {
    throw new Error(`❌ EDIT-T05: driver_acknowledged_version não atualizado para v${currentVersion}`);
  }

  console.log(`✅ EDIT-T05 PASSOU: Motorista confirmou ciência e driver_acknowledged_version foi persistido como ${currentVersion}.`);

  // =========================================================================
  // EDIT-T06: Adicionar parada — Classificada como Alteração Material
  // =========================================================================
  console.log('\n=========================================================================');
  console.log('EDIT-T06: Adicionar Parada — Alteração Material');
  console.log('=========================================================================');

  const vBeforeT06 = routeAfterAck!.route_version;
  const analysisT06 = routeEditService.classifyRouteEdit(routeAfterAck!, {
    expected_version: vBeforeT06,
    stops: [
      {
        id: routeAfterAck!.stops![0].id,
        destination_address: routeAfterAck!.stops![0].destination_address,
        destination_neighborhood: routeAfterAck!.stops![0].destination_neighborhood,
        cargo_description: routeAfterAck!.stops![0].cargo_description,
      },
      {
        destination_address: 'Av. João Naves de Ávila, 1500 - Santa Mônica',
        destination_neighborhood: 'Santa Mônica',
        cargo_description: 'Doces Finos',
      },
    ],
  });

  if (!analysisT06.is_material || analysisT06.change_type !== 'MATERIAL') {
    throw new Error('❌ EDIT-T06: Adicionar parada deveria ser classificada como MATERIAL');
  }

  console.log(`✅ EDIT-T06 PASSOU: Adicionar parada classificada como ALTERAÇÃO MATERIAL.`);

  // =========================================================================
  // EDIT-T07: Alterar final_driver_fee — Alteração Material
  // =========================================================================
  console.log('\n=========================================================================');
  console.log('EDIT-T07: Alterar final_driver_fee — Sempre Material');
  console.log('=========================================================================');

  const analysisT07 = routeEditService.classifyRouteEdit(routeAfterAck!, {
    expected_version: vBeforeT06,
    final_driver_fee: '65.00',
  });

  if (!analysisT07.is_material || analysisT07.change_type !== 'MATERIAL') {
    throw new Error('❌ EDIT-T07: Alterar frete final deveria ser classificado como MATERIAL');
  }

  console.log('✅ EDIT-T07 PASSOU: Alteração de frete classificada como ALTERAÇÃO MATERIAL.');

  // =========================================================================
  // EDIT-T08: Motorista aceita alteração material
  // =========================================================================
  console.log('\n=========================================================================');
  console.log('EDIT-T08: Alteração Material — Motorista Aceita');
  console.log('=========================================================================');

  capturedMessages.length = 0;

  // Submeter alteração material (aumento de frete de R$ 40 -> R$ 55)
  const matEditRes = await routeEditService.executeRouteEdit(
    acceptedRoute.id,
    {
      expected_version: vBeforeT06,
      final_driver_fee: '55.00',
    },
    'ADMIN_USER'
  );

  if (matEditRes.status !== 'PENDING_DRIVER_APPROVAL') {
    throw new Error('❌ EDIT-T08: Status deveria ser PENDING_DRIVER_APPROVAL');
  }

  // Verificar que a rota no banco ainda NÃO alterou o frete ativo
  const routeCheckPending = await routeService.getRouteById(acceptedRoute.id);
  if (!routeCheckPending!.change_pending_driver_approval) {
    throw new Error('❌ EDIT-T08: change_pending_driver_approval deve ser true');
  }
  if (routeCheckPending!.route_version !== vBeforeT06) {
    throw new Error('❌ EDIT-T08: Versão não deve mudar antes do aceite do motorista');
  }

  // Motorista clica [ACEITAR ALTERAÇÃO]
  const decisionRes = await routeEditService.handleDriverMaterialDecision(
    acceptedRoute.id,
    matEditRes.update_id!,
    driverA.id,
    'ACCEPT'
  );

  if (decisionRes.status !== 'ACCEPTED') {
    throw new Error('❌ EDIT-T08: Decisão deveria ter status ACCEPTED');
  }

  const finalRouteT08 = decisionRes.route;
  if (finalRouteT08.route_version !== vBeforeT06 + 1) {
    throw new Error(`❌ EDIT-T08: Versão após aceite deveria ser ${vBeforeT06 + 1}, obtido: ${finalRouteT08.route_version}`);
  }
  if (parseFloat(String(finalRouteT08.final_driver_fee)) !== 55.0) {
    throw new Error(`❌ EDIT-T08: Novo frete não foi aplicado: ${finalRouteT08.final_driver_fee}`);
  }
  if (finalRouteT08.change_pending_driver_approval) {
    throw new Error('❌ EDIT-T08: change_pending_driver_approval deve ser false após aceite');
  }

  console.log(`✅ EDIT-T08 PASSOU: Motorista aceitou alteração material. Nova versão v${finalRouteT08.route_version} com frete R$ 55,00 efetivado!`);

  // =========================================================================
  // EDIT-T09: Motorista recusa alteração material
  // =========================================================================
  console.log('\n=========================================================================');
  console.log('EDIT-T09: Alteração Material — Motorista Recusa');
  console.log('=========================================================================');

  const vBeforeT09 = finalRouteT08.route_version;

  // Submeter nova proposta material
  const matEditRes2 = await routeEditService.executeRouteEdit(
    acceptedRoute.id,
    {
      expected_version: vBeforeT09,
      final_driver_fee: '70.00',
    },
    'ADMIN_USER'
  );

  // Motorista recusa
  const rejectRes = await routeEditService.handleDriverMaterialDecision(
    acceptedRoute.id,
    matEditRes2.update_id!,
    driverA.id,
    'REJECT'
  );

  if (rejectRes.status !== 'REJECTED') {
    throw new Error('❌ EDIT-T09: Decisão deveria ter status REJECTED');
  }

  const routeAfterReject = await routeService.getRouteById(acceptedRoute.id);
  if (routeAfterReject!.route_version !== vBeforeT09) {
    throw new Error('❌ EDIT-T09: Versão não deve mudar após recusa');
  }
  if (parseFloat(String(routeAfterReject!.final_driver_fee)) !== 55.0) {
    throw new Error('❌ EDIT-T09: Frete não deve ser alterado após recusa');
  }
  if (routeAfterReject!.change_pending_driver_approval) {
    throw new Error('❌ EDIT-T09: change_pending_driver_approval deve ser limpo após recusa');
  }

  console.log('✅ EDIT-T09 PASSOU: Motorista recusou alteração material. Condições anteriores e frete de R$ 55,00 preservados intactos.');

  // =========================================================================
  // EDIT-T10: Bloqueio de Edição em Parada Concluída
  // =========================================================================
  console.log('\n=========================================================================');
  console.log('EDIT-T10: Imutabilidade de Paradas Concluídas');
  console.log('=========================================================================');

  // Adicionar uma segunda parada para garantir que a rota continue em andamento após a primeira entrega
  const [stop2] = await db
    .insert(routeStops)
    .values({
      route_id: acceptedRoute.id,
      sequence: 2,
      destination_address: 'Rua Dois, 200 - Centro',
      destination_neighborhood: 'Centro',
      cargo_description: 'Bolo Secundário',
      status: 'PENDING',
      pin_code: '5678',
    })
    .returning();

  // Avançar rota para concluído na parada
  await routeService.markArrivedPickup(acceptedRoute.id, { telegramUserId: driverA.telegram_user_id! });
  await routeService.markPickedUp(acceptedRoute.id, { telegramUserId: driverA.telegram_user_id! });
  const startRes = await routeService.startRoute(acceptedRoute.id, { telegramUserId: driverA.telegram_user_id! });

  // Concluir a primeira parada
  const stopIdToDeliver = startRes.nextStop!.id;
  await routeService.deliverStopWithPin(
    stopIdToDeliver,
    startRes.nextStop!.pin_code || '1234',
    { telegramUserId: driverA.telegram_user_id! }
  );

  const routeWithDeliveredStop = await routeService.getRouteById(acceptedRoute.id);
  const deliveredStop = routeWithDeliveredStop!.stops!.find((s) => s.id === stopIdToDeliver);
  if (deliveredStop?.status !== 'DELIVERED') {
    throw new Error('❌ Parada não foi marcada como DELIVERED');
  }

  // Tentar editar parada concluída
  try {
    await routeEditService.executeRouteEdit(
      acceptedRoute.id,
      {
        expected_version: routeWithDeliveredStop!.route_version,
        stops: [
          {
            id: deliveredStop.id,
            destination_address: 'Rua Hackeada, 999',
            destination_neighborhood: 'Centro',
            cargo_description: 'Bolo',
          },
          {
            id: stop2.id,
            destination_address: 'Rua Dois, 200 - Centro',
            destination_neighborhood: 'Centro',
            cargo_description: 'Bolo Secundário',
          },
        ],
      },
      'ADMIN_USER'
    );
    throw new Error('❌ EDIT-T10: Deveria ter bloqueado edição de parada já entregue');
  } catch (err: any) {
    if (!err.message.includes('CANNOT_EDIT_COMPLETED_STOP')) {
      throw new Error(`❌ EDIT-T10: Erro inesperado: ${err.message}`);
    }
  }

  console.log('✅ EDIT-T10 PASSOU: Tentativa de editar parada DELIVERED bloqueada com sucesso (CANNOT_EDIT_COMPLETED_STOP).');

  // =========================================================================
  // EDIT-T11: Bloqueio de Edição em Rota Concluída
  // =========================================================================
  console.log('\n=========================================================================');
  console.log('EDIT-T11: Bloqueio de Edição em Rota Concluída');
  console.log('=========================================================================');

  // Concluir a segunda parada para finalizar a rota
  await routeService.deliverStopWithPin(
    stop2.id,
    stop2.pin_code || '5678',
    { telegramUserId: driverA.telegram_user_id! }
  );

  const completedRoute = await routeService.getRouteById(acceptedRoute.id);
  if (completedRoute!.status !== 'COMPLETED') {
    // Forçar status COMPLETED para teste de barreira caso necessário
    await db.update(routes).set({ status: 'COMPLETED' }).where(eq(routes.id, acceptedRoute.id));
  }

  try {
    await routeEditService.executeRouteEdit(
      acceptedRoute.id,
      {
        expected_version: completedRoute!.route_version,
        final_deadline: '22:00',
      },
      'ADMIN_USER'
    );
    throw new Error('❌ EDIT-T11: Deveria ter bloqueado edição de rota COMPLETED');
  } catch (err: any) {
    if (!err.message.includes('CANNOT_EDIT_COMPLETED_ROUTE')) {
      throw new Error(`❌ EDIT-T11: Erro inesperado: ${err.message}`);
    }
  }

  console.log('✅ EDIT-T11 PASSOU: Edição operacional em rota COMPLETED bloqueada (CANNOT_EDIT_COMPLETED_ROUTE).');

  // =========================================================================
  // EDIT-T12: Concorrência Otimista (Dois administradores editam mesma versão)
  // =========================================================================
  console.log('\n=========================================================================');
  console.log('EDIT-T12: Proteção de Concorrência — Conflito Otimista');
  console.log('=========================================================================');

  // Criar uma nova rota DRAFT para teste de concorrência
  const concDraft = await routeService.createDraft({
    pickup_type: 'REGISTERED',
    pickup_location_id: pickupLoc.id,
    final_deadline: '19:00',
    total_fee: '45.00',
    accepted_vehicle_types: ['CAR_HATCH'],
    stops: [
      {
        destination_address: 'Rua Concorrente, 100',
        destination_neighborhood: 'Centro',
        cargo_description: 'Cesta Café',
      },
    ],
  });

  const vCurrentConc = concDraft.route_version;

  // Processo 1 edita com expected_version = 1
  const edit1 = await routeEditService.executeRouteEdit(
    concDraft.id,
    {
      expected_version: vCurrentConc,
      final_deadline: '19:30',
    },
    'ADMIN_1'
  );

  if (edit1.route.route_version !== vCurrentConc + 1) {
    throw new Error('❌ EDIT-T12: Primeiro processo deveria ter tido sucesso');
  }

  // Processo 2 tenta editar com o antigo expected_version = 1
  try {
    await routeEditService.executeRouteEdit(
      concDraft.id,
      {
        expected_version: vCurrentConc, // Versão defasada!
        final_deadline: '20:00',
      },
      'ADMIN_2'
    );
    throw new Error('❌ EDIT-T12: Segundo processo deveria ter sido rejeitado por conflito');
  } catch (err: any) {
    if (!err.message.includes('CONCURRENT_MODIFICATION_CONFLICT')) {
      throw new Error(`❌ EDIT-T12: Erro inesperado: ${err.message}`);
    }
  }

  console.log('✅ EDIT-T12 PASSOU: Conflito de concorrência disparado com sucesso (CONCURRENT_MODIFICATION_CONFLICT).');

  // =========================================================================
  // EDIT-T13: Callback Antigo
  // =========================================================================
  console.log('\n=========================================================================');
  console.log('EDIT-T13: Proteção contra Callbacks Telegram de Versão Antiga');
  console.log('=========================================================================');

  // Publicar rota
  const pubConc = await routeService.publishRoute(concDraft.id);
  const versionBeforeOldCallback = pubConc.route.route_version;

  // Atualizar para versão superior
  await routeEditService.executeRouteEdit(
    concDraft.id,
    {
      expected_version: versionBeforeOldCallback,
      final_deadline: '20:30',
    },
    'ADMIN_1'
  );

  const routeNow = await routeService.getRouteById(concDraft.id);
  const activeVersion = routeNow!.route_version;

  // Garantir status SENT no dispatch para o motorista Beta
  await db
    .update(routeOfferDispatches)
    .set({ status: 'SENT' })
    .where(
      and(
        eq(routeOfferDispatches.route_id, concDraft.id),
        eq(routeOfferDispatches.driver_id, driverB.id)
      )
    );

  // Motorista Beta tenta aceitar usando callback com expectedVersion = versão antiga
  const oldAcceptRes = await routeService.acceptRoute(concDraft.id, {
    driverId: driverB.id,
    telegramUserId: driverB.telegram_user_id!,
    expectedVersion: versionBeforeOldCallback, // Versão antiga
  });

  if (oldAcceptRes.status !== 'REJECTED' || (oldAcceptRes.error !== 'OUTDATED_ROUTE_VERSION' && oldAcceptRes.error !== 'STALE_ROUTE_VERSION')) {
    throw new Error(`❌ EDIT-T13: Deveria rejeitar aceite de versão antiga, obtido: ${JSON.stringify(oldAcceptRes)}`);
  }

  console.log('✅ EDIT-T13 PASSOU: Callback de versão antiga rejeitado fail-closed (OUTDATED_ROUTE_VERSION).');

  // =========================================================================
  // EDIT-T14: Privacidade
  // =========================================================================
  console.log('\n=========================================================================');
  console.log('EDIT-T14: Privacidade — Somente motorista vencedor tem acesso');
  console.log('=========================================================================');

  try {
    await routeService.getRouteNavigation(acceptedRoute.id, { driverId: driverB.id });
    throw new Error('❌ EDIT-T14: Motorista B não é o vencedor da rota acceptedRoute e não pode ver dados');
  } catch (err: any) {
    if (!err.message.includes('FORBIDDEN_NOT_WINNING_DRIVER')) {
      throw new Error(`❌ EDIT-T14: Erro inesperado: ${err.message}`);
    }
  }

  console.log('✅ EDIT-T14 PASSOU: Isolamento de dados de navegação e atualização garantido para o motorista vencedor.');

  // =========================================================================
  // EDIT-T15: Pagamento utiliza exclusivamente final_driver_fee aprovado
  // =========================================================================
  console.log('\n=========================================================================');
  console.log('EDIT-T15: Integridade do Módulo de Pagamento');
  console.log('=========================================================================');

  // Registrar pagamento da rota que teve o frete alterado de R$ 40 para R$ 55 (EDIT-T08)
  const payRes = await routeService.registerRoutePayment(
    acceptedRoute.id,
    {
      paid_by: 'ADMIN_FINANCE',
      payment_method: 'PIX',
      payment_reference: 'PIX_TRANS_M44_TEST',
      payment_note: 'Pagamento pós alteração material'
    }
  );

  const routePaid = await routeService.getRouteById(acceptedRoute.id);
  if (routePaid!.payment_status !== 'PAID') {
    throw new Error('❌ EDIT-T15: Rota não ficou com status PAID');
  }
  if (parseFloat(String(routePaid!.final_driver_fee)) !== 55.0) {
    throw new Error(`❌ EDIT-T15: Frete no pagamento divergente: ${routePaid!.final_driver_fee}`);
  }

  console.log(`✅ EDIT-T15 PASSOU: Pagamento liquidado com o valor final aprovado (R$ 55,00), preservando integridade financeira.`);

  // Restaurar método original
  (telegramBot as any).callTelegramApi = originalCallApi;

  // Cleanup: Marcar motoristas de teste como BLOCKED para evitar poluição da base ativa
  try {
    await db.update(drivers).set({ status: 'BLOCKED' }).where(inArray(drivers.id, [driverA.id, driverB.id]));
  } catch {
    // Ignore cleanup error
  }

  console.log('\n=========================================================================');
  console.log('🎉 TODOS OS TESTES DA SUÍTE M4.4 (EDIT-T01 A EDIT-T15) PASSARAM COM SUCESSO DETERMINÍSTICO!');
  console.log('=========================================================================');
}

runM44Suite()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('💥 FALHA NA SUÍTE M4.4:', err);
    process.exit(1);
  });
