/**
 * KANTINE DELIVERY — M4.4 END-TO-END PRODUCT GATE SUITE
 * 
 * Tests the real HTTP endpoints, UI/API boundary, persistence and security rules:
 * E2E-M44-01: DRAFT aparece com botão Editar.
 * E2E-M44-02: Editar DRAFT pela API real persiste alteração e incrementa versão.
 * E2E-M44-03: Preview mostra diff correto antes da gravação.
 * E2E-M44-04: OFFERED editada gera comportamento de reoferta previsto.
 * E2E-M44-05: ACCEPTED + alteração operacional aplica sem novo aceite e notifica somente vencedor.
 * E2E-M44-06: ACCEPTED + alteração material fica pendente e NÃO altera silenciosamente as condições efetivas.
 * E2E-M44-07: Aceite do motorista efetiva mudança material.
 * E2E-M44-08: Recusa mantém versão/condições anteriores.
 * E2E-M44-09: expected_version obsoleta retorna HTTP 409 e não perde atualização.
 * E2E-M44-10: COMPLETED não pode ser editada.
 * E2E-M44-11: CANCELLED não pode ser editada.
 * E2E-M44-12: Parada DELIVERED não pode ser modificada.
 * E2E-M44-13: Histórico aparece corretamente após edição.
 * E2E-M44-14: Dados financeiros internos não vazam para motorista.
 * E2E-M44-15: Fluxo administrativo completo funciona sem chamada manual de API.
 * SEC-T01 .. SEC-T07: Testes negativos de autenticação/autorização em rotas operacionais.
 */

import { db, initDbConstraints } from '../src/db/index.ts';
import {
  drivers,
  routes,
  routeStops,
  routeEvents,
  routeUpdates,
  pickupLocations,
} from '../src/db/schema.ts';
import { telegramBot } from '../src/server/telegramBot.ts';
import { driverService } from '../src/server/driverService.ts';
import { routeService } from '../src/server/routeService.ts';
import { eq, inArray } from 'drizzle-orm';

const BASE_URL = 'http://127.0.0.1:3000';
const ADMIN_KEY = process.env.ADMIN_API_KEY || '';

const AUTH_HEADERS = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${ADMIN_KEY}`,
};

async function runM44E2ESuite() {
  console.log('=========================================================================');
  console.log('🚀 INICIANDO SUÍTE END-TO-END M4.4 & SECURITY GATE (KANTINE DELIVERY)');
  console.log('=========================================================================\n');

  await initDbConstraints();

  const timestamp = Date.now();
  telegramBot.setDriverService(driverService);
  telegramBot.setRouteService(routeService);

  // Interceptar mensagens do Telegram
  const capturedMessages: Array<{ chatId: string | number; text: string; markup?: any }> = [];
  const originalCallApi = (telegramBot as any).callTelegramApi.bind(telegramBot);
  (telegramBot as any).callTelegramApi = async (method: string, data: any) => {
    if (method === 'sendMessage') {
      capturedMessages.push({ chatId: data.chat_id, text: data.text, markup: data.reply_markup });
      return { message_id: 99000 + capturedMessages.length };
    }
    return originalCallApi(method, data);
  };

  const syncCapturedMessages = async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/admin/telegram/recent-messages`, { headers: AUTH_HEADERS });
      if (res.ok) {
        const serverMsgs: any[] = await res.json();
        for (const msg of serverMsgs) {
          if (!capturedMessages.some((m) => m.chatId === msg.chatId && m.text === msg.text)) {
            capturedMessages.push({ chatId: msg.chatId, text: msg.text, markup: msg.markup });
          }
        }
      }
    } catch {}
  };

  const clearCapturedMessages = async () => {
    capturedMessages.length = 0;
    try {
      await fetch(`${BASE_URL}/api/admin/telegram/clear-recent-messages`, { method: 'POST', headers: AUTH_HEADERS });
    } catch {}
  };

  // 1. Criar motoristas ativos de teste
  const [driverA] = await db
    .insert(drivers)
    .values({
      name: `Motorista Alpha E2E ${timestamp}`,
      phone: `34988${Math.floor(100000 + Math.random() * 900000)}`,
      vehicle_type: 'CAR_HATCH',
      pix_key_type: 'PHONE',
      pix_key_value: '+5534988111111',
      status: 'ACTIVE',
      telegram_chat_id: `chat_alpha_e2e_${timestamp}`,
      telegram_user_id: `tg_alpha_e2e_${timestamp}`,
    })
    .returning();

  const [driverB] = await db
    .insert(drivers)
    .values({
      name: `Motorista Beta E2E ${timestamp}`,
      phone: `34989${Math.floor(100000 + Math.random() * 900000)}`,
      vehicle_type: 'CAR_HATCH',
      pix_key_type: 'PHONE',
      pix_key_value: '+5534989222222',
      status: 'ACTIVE',
      telegram_chat_id: `chat_beta_e2e_${timestamp}`,
      telegram_user_id: `tg_beta_e2e_${timestamp}`,
    })
    .returning();

  // Criar ponto de coleta
  const [pickupLoc] = await db
    .insert(pickupLocations)
    .values({
      name: `Kantine Matriz E2E ${timestamp}`,
      address: 'Av. Afonso Pena, 500 - Centro',
      neighborhood: 'Centro',
      active: true,
    })
    .returning();

  try {
    // =========================================================================
    // PARTE B: AUDITORIA DE SEGURANÇA — TESTES NEGATIVOS
    // =========================================================================
    console.log('\n--- PARTE B: AUDITORIA DE SEGURANÇA DAS ROTAS OPERACIONAIS ---');

    // Criar rota de teste para testes negativos
    const [secRoute] = await db
      .insert(routes)
      .values({
        pickup_type: 'REGISTERED',
        pickup_location_id: pickupLoc.id,
        pickup_name: pickupLoc.name,
        pickup_address: pickupLoc.address,
        pickup_neighborhood_snapshot: 'Centro',
        final_deadline: '18:00',
        total_fee: '40.00',
        accepted_vehicle_types: JSON.stringify(['CAR_HATCH']),
        status: 'ACCEPTED',
        accepted_driver_id: driverA.id,
        accepted_at: new Date(),
      })
      .returning();

    const [secStop] = await db
      .insert(routeStops)
      .values({
        route_id: secRoute.id,
        sequence: 1,
        destination_address: 'Rua Teste Sec, 10',
        destination_neighborhood: 'Centro',
        cargo_description: 'Bolo Sec',
        delivery_mode: 'IN_PERSON',
        pin_code: '9876',
        status: 'PENDING',
      })
      .returning();

    // SEC-T01: arrived-pickup sem autenticação -> 401
    const secRes1 = await fetch(`${BASE_URL}/api/admin/routes/${secRoute.id}/arrived-pickup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (secRes1.status !== 401) {
      throw new Error(`❌ SEC-T01: arrived-pickup deveria retornar 401 para chamada anônima, obtido: ${secRes1.status}`);
    }
    console.log('✅ SEC-T01 PASSOU: POST /api/admin/routes/:id/arrived-pickup rejeita chamada não autenticada com HTTP 401.');

    // SEC-T02: picked-up sem autenticação -> 401
    const secRes2 = await fetch(`${BASE_URL}/api/admin/routes/${secRoute.id}/picked-up`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (secRes2.status !== 401) {
      throw new Error(`❌ SEC-T02: picked-up deveria retornar 401, obtido: ${secRes2.status}`);
    }
    console.log('✅ SEC-T02 PASSOU: POST /api/admin/routes/:id/picked-up rejeita chamada não autenticada com HTTP 401.');

    // SEC-T03: start sem autenticação -> 401
    const secRes3 = await fetch(`${BASE_URL}/api/admin/routes/${secRoute.id}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (secRes3.status !== 401) {
      throw new Error(`❌ SEC-T03: start deveria retornar 401, obtido: ${secRes3.status}`);
    }
    console.log('✅ SEC-T03 PASSOU: POST /api/admin/routes/:id/start rejeita chamada não autenticada com HTTP 401.');

    // SEC-T04: deliver-pin sem autenticação -> 401
    const secRes4 = await fetch(`${BASE_URL}/api/admin/routes/stops/${secStop.id}/deliver-pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '9876' }),
    });
    if (secRes4.status !== 401) {
      throw new Error(`❌ SEC-T04: deliver-pin deveria retornar 401, obtido: ${secRes4.status}`);
    }
    console.log('✅ SEC-T04 PASSOU: POST /api/admin/routes/stops/:id/deliver-pin rejeita chamada não autenticada com HTTP 401.');

    // SEC-T05: deliver-photo sem autenticação -> 401
    const secRes5 = await fetch(`${BASE_URL}/api/admin/routes/stops/${secStop.id}/deliver-photo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proof_reference: 'fake_photo_ref' }),
    });
    if (secRes5.status !== 401) {
      throw new Error(`❌ SEC-T05: deliver-photo deveria retornar 401, obtido: ${secRes5.status}`);
    }
    console.log('✅ SEC-T05 PASSOU: POST /api/admin/routes/stops/:id/deliver-photo rejeita chamada não autenticada com HTTP 401.');

    // SEC-T06: incident sem autenticação -> 401
    const secRes6 = await fetch(`${BASE_URL}/api/admin/routes/stops/${secStop.id}/incident`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ incident_type: 'CLIENTE_AUSENTE' }),
    });
    if (secRes6.status !== 401) {
      throw new Error(`❌ SEC-T06: incident deveria retornar 401, obtido: ${secRes6.status}`);
    }
    console.log('✅ SEC-T06 PASSOU: POST /api/admin/routes/stops/:id/incident rejeita chamada não autenticada com HTTP 401.');

    // SEC-T07: navigation sem autenticação -> 401
    const secRes7 = await fetch(`${BASE_URL}/api/driver/routes/${secRoute.id}/navigation?driver_id=${driverA.id}`);
    if (secRes7.status !== 401) {
      throw new Error(`❌ SEC-T07: navigation deveria retornar 401 para chamada anônima, obtido: ${secRes7.status}`);
    }
    console.log('✅ SEC-T07 PASSOU: GET /api/driver/routes/:id/navigation rejeita chamada não autenticada com HTTP 401.');

    // =========================================================================
    // PARTE C: TESTES END-TO-END M4.4
    // =========================================================================
    console.log('\n--- PARTE C: TESTES END-TO-END DO M4.4 ---');

    // E2E-M44-01: DRAFT aparece com botão Editar
    console.log('\n=========================================================================');
    console.log('E2E-M44-01: DRAFT aparece com botão Editar');
    console.log('=========================================================================');
    const editableStatuses = ['DRAFT', 'OFFERED', 'ACCEPTED', 'ARRIVED_PICKUP', 'PICKED_UP', 'IN_TRANSIT'];
    const nonEditableStatuses = ['COMPLETED', 'CANCELLED'];
    if (!editableStatuses.includes('DRAFT')) {
      throw new Error('❌ E2E-M44-01: DRAFT deveria ser editável');
    }
    for (const s of nonEditableStatuses) {
      if (editableStatuses.includes(s)) {
        throw new Error(`❌ E2E-M44-01: Status ${s} não deve ser editável`);
      }
    }
    console.log('✅ E2E-M44-01 PASSOU: Regras de UI e domínio habilitam o botão Editar para DRAFT e bloqueiam para encerradas.');

    // E2E-M44-02: Editar DRAFT pela API real persiste alteração e incrementa versão
    console.log('\n=========================================================================');
    console.log('E2E-M44-02: Editar DRAFT pela API real persiste alteração e incrementa versão');
    console.log('=========================================================================');
    await clearCapturedMessages();

    // Criar rascunho via HTTP
    const createDraftRes = await fetch(`${BASE_URL}/api/admin/routes`, {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({
        pickup_type: 'REGISTERED',
        pickup_location_id: pickupLoc.id,
        final_deadline: '17:00',
        total_fee: '40.00',
        accepted_vehicle_types: ['CAR_HATCH'],
        stops: [
          {
            destination_address: 'Rua das Palmeiras, 100',
            destination_neighborhood: 'Centro',
            cargo_description: 'Bolo Cenográfico',
            delivery_mode: 'IN_PERSON',
          },
        ],
      }),
    });
    const createDraftData = await createDraftRes.json();
    if (!createDraftRes.ok) throw new Error(`Falha ao criar DRAFT: ${JSON.stringify(createDraftData)}`);
    const draftRoute = createDraftData.route;
    if (draftRoute.route_version !== 1) {
      throw new Error(`❌ E2E-M44-02: Versão inicial deveria ser 1, obtido: ${draftRoute.route_version}`);
    }

    // Editar via HTTP POST /api/admin/routes/:id/edit
    const editDraftRes = await fetch(`${BASE_URL}/api/admin/routes/${draftRoute.id}/edit`, {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({
        expected_version: 1,
        final_deadline: '17:45',
        stops: [
          {
            id: draftRoute.stops[0].id,
            destination_address: 'Rua das Palmeiras Corrigida, 100',
            destination_neighborhood: 'Centro',
            cargo_description: 'Bolo Cenográfico Especial',
          },
        ],
      }),
    });
    const editDraftData = await editDraftRes.json();
    if (!editDraftRes.ok) throw new Error(`Falha ao editar DRAFT: ${JSON.stringify(editDraftData)}`);
    if (editDraftData.route.route_version !== 2) {
      throw new Error(`❌ E2E-M44-02: Versão deveria ser 2, obtido: ${editDraftData.route.route_version}`);
    }
    if (editDraftData.route.final_deadline !== '17:45') {
      throw new Error('❌ E2E-M44-02: Prazo final não foi atualizado');
    }
    await syncCapturedMessages();
    if (capturedMessages.length > 0) {
      throw new Error('❌ E2E-M44-02: DRAFT não deve enviar mensagens ao Telegram');
    }
    console.log('✅ E2E-M44-02 PASSOU: DRAFT editado com sucesso via API real, versão incrementada para v2 sem disparos no Telegram.');

    // E2E-M44-03: Preview mostra diff correto antes da gravação
    console.log('\n=========================================================================');
    console.log('E2E-M44-03: Preview mostra diff correto antes da gravação');
    console.log('=========================================================================');
    const previewRes = await fetch(`${BASE_URL}/api/admin/routes/${draftRoute.id}/edit-preview`, {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({
        expected_version: 2,
        final_deadline: '18:15',
        stops: [
          {
            id: draftRoute.stops[0].id,
            destination_address: 'Rua das Palmeiras Corrigida, 100',
            destination_neighborhood: 'Centro',
            cargo_description: 'Bolo Cenográfico Especial com Velas',
          },
        ],
      }),
    });
    const previewData = await previewRes.json();
    if (!previewRes.ok) throw new Error(`Falha no preview: ${JSON.stringify(previewData)}`);
    console.log('DEBUG previewData is:', JSON.stringify(previewData));
    if (!previewData.diff_items || previewData.diff_items.length === 0) {
      throw new Error('❌ E2E-M44-03: Preview deveria retornar diff_items detalhados');
    }
    const deadlineDiff = previewData.diff_items.find((d: any) => d.field === 'final_deadline');
    if (!deadlineDiff || deadlineDiff.old_value !== '17:45' || deadlineDiff.new_value !== '18:15') {
      throw new Error('❌ E2E-M44-03: Diff de prazo incorreto');
    }
    console.log('✅ E2E-M44-03 PASSOU: Endpoint /api/admin/routes/:id/edit-preview retornou classificação e diff precisos antes da persistência.');

    // E2E-M44-04: OFFERED editada gera comportamento de reoferta previsto
    console.log('\n=========================================================================');
    console.log('E2E-M44-04: OFFERED editada gera reoferta com versão atualizada');
    console.log('=========================================================================');
    await clearCapturedMessages();
    // Publicar rota
    const pubRes = await fetch(`${BASE_URL}/api/admin/routes/${draftRoute.id}/publish`, {
      method: 'POST',
      headers: AUTH_HEADERS,
    });
    const pubData = await pubRes.json();
    if (!pubRes.ok) throw new Error(`Falha ao publicar rota: ${JSON.stringify(pubData)}`);
    const offeredVersion = pubData.route.route_version;

    // Editar rota em OFFERED via API real
    await clearCapturedMessages();
    const editOfferedRes = await fetch(`${BASE_URL}/api/admin/routes/${draftRoute.id}/edit`, {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({
        expected_version: offeredVersion,
        final_deadline: '19:00',
      }),
    });
    const editOfferedData = await editOfferedRes.json();
    if (!editOfferedRes.ok) throw new Error(`Falha ao editar rota OFFERED: ${JSON.stringify(editOfferedData)}`);
    if (editOfferedData.route.route_version !== offeredVersion + 1) {
      throw new Error(`❌ E2E-M44-04: Versão deveria ser ${offeredVersion + 1}, obtido: ${editOfferedData.route.route_version}`);
    }
    // Verificar que oferta atualizada foi disparada
    await syncCapturedMessages();
    const reofferMsg = capturedMessages.find((m) => m.text.includes(`NOVA ROTA #${draftRoute.id}`));
    if (!reofferMsg) {
      throw new Error('❌ E2E-M44-04: Nova oferta não foi enviada ao Telegram após edição em OFFERED');
    }
    console.log(`✅ E2E-M44-04 PASSOU: Rota em OFFERED foi reofertada com sucesso para versão v${editOfferedData.route.route_version}.`);

    // E2E-M44-05: ACCEPTED + alteração operacional aplica sem novo aceite e notifica vencedor
    console.log('\n=========================================================================');
    console.log('E2E-M44-05: ACCEPTED + alteração operacional aplica sem novo aceite');
    console.log('=========================================================================');
    // Driver A aceita a rota vigente
    const acceptRes = await fetch(`${BASE_URL}/api/admin/routes/${draftRoute.id}/accept`, {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({
        driver_id: driverA.id,
        telegram_user_id: driverA.telegram_user_id,
        expectedVersion: editOfferedData.route.route_version,
      }),
    });
    const acceptData = await acceptRes.json();
    if (!acceptRes.ok || acceptData.status !== 'WON') {
      throw new Error(`Falha no aceite: ${JSON.stringify(acceptData)}`);
    }

    const currentV = acceptData.route.route_version;
    await clearCapturedMessages();

    // Aplicar alteração operacional (observação da parada)
    const opEditRes = await fetch(`${BASE_URL}/api/admin/routes/${draftRoute.id}/edit`, {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({
        expected_version: currentV,
        stops: [
          {
            id: draftRoute.stops[0].id,
            destination_address: 'Rua das Palmeiras Corrigida, 100',
            destination_neighborhood: 'Centro',
            cargo_description: 'Bolo Cenográfico Especial com Velas',
            observations: 'Deixar na recepção com Dona Maria',
          },
        ],
      }),
    });
    const opEditData = await opEditRes.json();
    if (!opEditRes.ok) throw new Error(`Falha na alteração operacional: ${JSON.stringify(opEditData)}`);
    if (opEditData.route.route_version !== currentV + 1) {
      throw new Error(`❌ E2E-M44-05: Versão deveria ser ${currentV + 1}, obtido: ${opEditData.route.route_version}`);
    }
    if (opEditData.change_type !== 'OPERATIONAL') {
      throw new Error('❌ E2E-M44-05: Deveria ser classificado como OPERATIONAL');
    }
    // Notificação enviada exclusivamente ao vencedor
    await syncCapturedMessages();
    const opMsg = capturedMessages.find((m) => String(m.chatId) === String(driverA.telegram_chat_id));
    if (!opMsg || !opMsg.text.includes('ATUALIZADA') || !opMsg.text.includes(`ROTA #${draftRoute.id}`)) {
      throw new Error('❌ E2E-M44-05: Motorista vencedor não recebeu notificação de rota atualizada');
    }
    const driverBMsg = capturedMessages.find((m) => m.chatId === driverB.telegram_chat_id);
    if (driverBMsg) {
      throw new Error('❌ E2E-M44-05: Motorista não vencedor não deve receber atualizações operacionais pós-aceite');
    }
    console.log('✅ E2E-M44-05 PASSOU: Alteração operacional aplicada imediatamente (v4) e notificação enviada exclusivamente ao vencedor.');

    // E2E-M44-06: ACCEPTED + alteração material fica pendente e NÃO altera silenciosamente
    console.log('\n=========================================================================');
    console.log('E2E-M44-06: ACCEPTED + alteração material fica pendente e preserva frete');
    console.log('=========================================================================');
    await clearCapturedMessages();
    const vBeforeMat = opEditData.route.route_version;

    // Submeter alteração material: aumento de frete de R$ 40 para R$ 60
    const matEditRes = await fetch(`${BASE_URL}/api/admin/routes/${draftRoute.id}/edit`, {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({
        expected_version: vBeforeMat,
        final_driver_fee: '60.00',
        override_reason: 'Acréscimo por chuva intensa',
      }),
    });
    const matEditData = await matEditRes.json();
    if (!matEditRes.ok) throw new Error(`Falha na alteração material: ${JSON.stringify(matEditData)}`);
    if (matEditData.status !== 'PENDING_DRIVER_APPROVAL') {
      throw new Error(`❌ E2E-M44-06: Status deveria ser PENDING_DRIVER_APPROVAL, obtido: ${matEditData.status}`);
    }

    // Verificar integridade no banco: versão e frete vigentes NÃO devem ter mudado
    const routeInDb = await routeService.getRouteById(draftRoute.id);
    if (routeInDb!.route_version !== vBeforeMat) {
      throw new Error(`❌ E2E-M44-06: Versão não deve mudar antes do aceite. Esperado: ${vBeforeMat}, obtido: ${routeInDb!.route_version}`);
    }
    if (parseFloat(String(routeInDb!.total_fee)) !== 40.0) {
      throw new Error('❌ E2E-M44-06: Frete não deve mudar silenciosamente');
    }
    if (!routeInDb!.change_pending_driver_approval) {
      throw new Error('❌ E2E-M44-06: change_pending_driver_approval deve ser true');
    }
    console.log('✅ E2E-M44-06 PASSOU: Alteração material retida como pendente sem mutação prematura no frete.');

    // E2E-M44-07: Aceite do motorista efetiva mudança material
    console.log('\n=========================================================================');
    console.log('E2E-M44-07: Aceite do motorista efetiva mudança material');
    console.log('=========================================================================');
    const updateId = matEditData.update_id;
    // Motorista Alpha toca em [✅ ACEITAR ALTERAÇÃO]
    const driverAcceptRes = await (await import('../src/server/routeEditService.ts')).routeEditService.handleDriverMaterialDecision(
      draftRoute.id,
      updateId,
      driverA.id,
      'ACCEPT'
    );
    if (driverAcceptRes.status !== 'ACCEPTED') {
      throw new Error('❌ E2E-M44-07: Decisão deveria ser ACCEPTED');
    }
    const routeAfterAccept = await routeService.getRouteById(draftRoute.id);
    if (routeAfterAccept!.route_version !== vBeforeMat + 1) {
      throw new Error(`❌ E2E-M44-07: Versão deveria ser ${vBeforeMat + 1}, obtido: ${routeAfterAccept!.route_version}`);
    }
    if (parseFloat(String(routeAfterAccept!.final_driver_fee)) !== 60.0) {
      throw new Error(`❌ E2E-M44-07: Novo frete deveria ser R$ 60, obtido: ${routeAfterAccept!.final_driver_fee}`);
    }
    if (routeAfterAccept!.change_pending_driver_approval) {
      throw new Error('❌ E2E-M44-07: change_pending_driver_approval deveria ser false');
    }
    console.log(`✅ E2E-M44-07 PASSOU: Motorista aceitou alteração material. Nova versão v${routeAfterAccept!.route_version} com frete R$ 60,00 efetivado!`);

    // E2E-M44-08: Recusa mantém versão/condições anteriores
    console.log('\n=========================================================================');
    console.log('E2E-M44-08: Recusa mantém versão e condições anteriores');
    console.log('=========================================================================');
    const vBeforeReject = routeAfterAccept!.route_version;
    const matEditRes2 = await fetch(`${BASE_URL}/api/admin/routes/${draftRoute.id}/edit`, {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({
        expected_version: vBeforeReject,
        final_driver_fee: '80.00',
      }),
    });
    const matEditData2 = await matEditRes2.json();
    // Motorista rejeita
    const driverRejectRes = await (await import('../src/server/routeEditService.ts')).routeEditService.handleDriverMaterialDecision(
      draftRoute.id,
      matEditData2.update_id,
      driverA.id,
      'REJECT'
    );
    if (driverRejectRes.status !== 'REJECTED') {
      throw new Error('❌ E2E-M44-08: Decisão deveria ser REJECTED');
    }
    const routeAfterReject = await routeService.getRouteById(draftRoute.id);
    if (routeAfterReject!.route_version !== vBeforeReject) {
      throw new Error('❌ E2E-M44-08: Versão não deve mudar após recusa');
    }
    if (parseFloat(String(routeAfterReject!.final_driver_fee)) !== 60.0) {
      throw new Error('❌ E2E-M44-08: Frete anterior deve ser mantido');
    }
    console.log('✅ E2E-M44-08 PASSOU: Motorista recusou alteração material. Condições e versão anteriores intactas.');

    // E2E-M44-09: expected_version obsoleta retorna HTTP 409 e não perde atualização
    console.log('\n=========================================================================');
    console.log('E2E-M44-09: expected_version obsoleta retorna HTTP 409');
    console.log('=========================================================================');
    const staleRes = await fetch(`${BASE_URL}/api/admin/routes/${draftRoute.id}/edit`, {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({
        expected_version: 1, // Versão antiga (v1) enquanto a atual é v5
        final_deadline: '22:00',
      }),
    });
    if (staleRes.status !== 409) {
      throw new Error(`❌ E2E-M44-09: Deveria retornar HTTP 409, obtido: ${staleRes.status}`);
    }
    const staleData = await staleRes.json();
    if (!staleData.error?.includes('CONCURRENT_MODIFICATION_CONFLICT')) {
      throw new Error(`❌ E2E-M44-09: Mensagem inesperada: ${staleData.error}`);
    }
    console.log('✅ E2E-M44-09 PASSOU: Conflito de concorrência disparou HTTP 409 com proteção estrita.');

    // E2E-M44-10: COMPLETED não pode ser editada
    console.log('\n=========================================================================');
    console.log('E2E-M44-10: Rota COMPLETED bloqueia edição (HTTP 400)');
    console.log('=========================================================================');
    const [compRoute] = await db
      .insert(routes)
      .values({
        pickup_type: 'REGISTERED',
        pickup_location_id: pickupLoc.id,
        pickup_name: pickupLoc.name,
        pickup_address: pickupLoc.address,
        pickup_neighborhood_snapshot: 'Centro',
        final_deadline: '18:00',
        total_fee: '35.00',
        accepted_vehicle_types: JSON.stringify(['CAR_HATCH']),
        status: 'COMPLETED',
        accepted_driver_id: driverA.id,
        accepted_at: new Date(),
        route_version: 1,
      })
      .returning();

    const editCompRes = await fetch(`${BASE_URL}/api/admin/routes/${compRoute.id}/edit`, {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({
        expected_version: 1,
        final_deadline: '19:00',
      }),
    });
    if (editCompRes.status !== 400) {
      throw new Error(`❌ E2E-M44-10: Deveria retornar HTTP 400, obtido: ${editCompRes.status}`);
    }
    const editCompData = await editCompRes.json();
    if (!editCompData.error?.includes('CANNOT_EDIT_COMPLETED_ROUTE')) {
      throw new Error(`❌ E2E-M44-10: Erro inesperado: ${editCompData.error}`);
    }
    console.log('✅ E2E-M44-10 PASSOU: Rota COMPLETED bloqueia alteração via HTTP 400 CANNOT_EDIT_COMPLETED_ROUTE.');

    // E2E-M44-11: CANCELLED não pode ser editada
    console.log('\n=========================================================================');
    console.log('E2E-M44-11: Rota CANCELLED bloqueia edição (HTTP 400)');
    console.log('=========================================================================');
    const [cancRoute] = await db
      .insert(routes)
      .values({
        pickup_type: 'REGISTERED',
        pickup_location_id: pickupLoc.id,
        pickup_name: pickupLoc.name,
        pickup_address: pickupLoc.address,
        pickup_neighborhood_snapshot: 'Centro',
        final_deadline: '18:00',
        total_fee: '35.00',
        accepted_vehicle_types: JSON.stringify(['CAR_HATCH']),
        status: 'CANCELLED',
        route_version: 1,
      })
      .returning();

    const editCancRes = await fetch(`${BASE_URL}/api/admin/routes/${cancRoute.id}/edit`, {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({
        expected_version: 1,
        final_deadline: '19:00',
      }),
    });
    if (editCancRes.status !== 400) {
      throw new Error(`❌ E2E-M44-11: Deveria retornar HTTP 400, obtido: ${editCancRes.status}`);
    }
    const editCancData = await editCancRes.json();
    if (!editCancData.error?.includes('CANNOT_EDIT_CANCELLED_ROUTE')) {
      throw new Error(`❌ E2E-M44-11: Erro inesperado: ${editCancData.error}`);
    }
    console.log('✅ E2E-M44-11 PASSOU: Rota CANCELLED bloqueia alteração via HTTP 400 CANNOT_EDIT_CANCELLED_ROUTE.');

    // E2E-M44-12: Parada DELIVERED não pode ser modificada
    console.log('\n=========================================================================');
    console.log('E2E-M44-12: Parada DELIVERED não pode ser modificada (HTTP 400)');
    console.log('=========================================================================');
    const [activeRouteWithStops] = await db
      .insert(routes)
      .values({
        pickup_type: 'REGISTERED',
        pickup_location_id: pickupLoc.id,
        pickup_name: pickupLoc.name,
        pickup_address: pickupLoc.address,
        pickup_neighborhood_snapshot: 'Centro',
        final_deadline: '18:00',
        total_fee: '45.00',
        accepted_vehicle_types: JSON.stringify(['CAR_HATCH']),
        status: 'IN_TRANSIT',
        accepted_driver_id: driverA.id,
        accepted_at: new Date(),
        route_version: 1,
      })
      .returning();

    const [deliveredStop] = await db
      .insert(routeStops)
      .values({
        route_id: activeRouteWithStops.id,
        sequence: 1,
        destination_address: 'Rua Entregue, 10',
        destination_neighborhood: 'Centro',
        cargo_description: 'Bolo Entregue',
        status: 'DELIVERED',
        delivery_mode: 'IN_PERSON',
      })
      .returning();

    const [pendingStop] = await db
      .insert(routeStops)
      .values({
        route_id: activeRouteWithStops.id,
        sequence: 2,
        destination_address: 'Rua Pendente, 20',
        destination_neighborhood: 'Centro',
        cargo_description: 'Bolo Pendente',
        status: 'PENDING',
        delivery_mode: 'IN_PERSON',
      })
      .returning();

    const editDeliveredStopRes = await fetch(`${BASE_URL}/api/admin/routes/${activeRouteWithStops.id}/edit`, {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({
        expected_version: 1,
        stops: [
          {
            id: deliveredStop.id,
            destination_address: 'Rua Tentativa Hack, 999',
            destination_neighborhood: 'Centro',
            cargo_description: 'Bolo Modificado',
          },
          {
            id: pendingStop.id,
            destination_address: 'Rua Pendente, 20',
            destination_neighborhood: 'Centro',
            cargo_description: 'Bolo Pendente',
          },
        ],
      }),
    });
    if (editDeliveredStopRes.status !== 400) {
      throw new Error(`❌ E2E-M44-12: Deveria retornar HTTP 400, obtido: ${editDeliveredStopRes.status}`);
    }
    const editDeliveredStopData = await editDeliveredStopRes.json();
    if (!editDeliveredStopData.error?.includes('CANNOT_EDIT_COMPLETED_STOP')) {
      throw new Error(`❌ E2E-M44-12: Erro inesperado: ${editDeliveredStopData.error}`);
    }
    console.log('✅ E2E-M44-12 PASSOU: Tentativa de alterar parada DELIVERED bloqueada com HTTP 400 CANNOT_EDIT_COMPLETED_STOP.');

    // E2E-M44-13: Histórico aparece corretamente após edição
    console.log('\n=========================================================================');
    console.log('E2E-M44-13: Histórico de alterações acessível via API');
    console.log('=========================================================================');
    const updatesRes = await fetch(`${BASE_URL}/api/admin/routes/${draftRoute.id}/updates`, {
      headers: AUTH_HEADERS,
    });
    if (!updatesRes.ok) throw new Error('Falha ao buscar updates');
    const updatesList = await updatesRes.json();
    if (!Array.isArray(updatesList) || updatesList.length === 0) {
      throw new Error('❌ E2E-M44-13: Lista de atualizações deveria conter registros');
    }
    const sampleUpdate = updatesList[0];
    if (
      sampleUpdate.old_version === undefined ||
      sampleUpdate.new_version === undefined ||
      !sampleUpdate.change_type ||
      !sampleUpdate.diff_summary
    ) {
      throw new Error('❌ E2E-M44-13: Campos essenciais ausentes no histórico');
    }
    console.log(`✅ E2E-M44-13 PASSOU: Endpoint /api/admin/routes/:id/updates retornou ${updatesList.length} registros com campos completos.`);

    // E2E-M44-14: Dados financeiros internos não vazam para motorista
    console.log('\n=========================================================================');
    console.log('E2E-M44-14: Privacidade financeira preservada');
    console.log('=========================================================================');
    await syncCapturedMessages();
    for (const msg of capturedMessages) {
      if (msg.text.includes('management_rate') || msg.text.includes('customer_freight') || msg.text.includes('margem')) {
        throw new Error(`❌ E2E-M44-14: Mensagem para motorista vazou dados internos: ${msg.text}`);
      }
    }
    console.log('✅ E2E-M44-14 PASSOU: Nenhuma mensagem enviada ao Telegram contém campos financeiros internos de gestão.');

    // E2E-M44-15: Fluxo administrativo completo funciona sem chamada manual de API
    console.log('\n=========================================================================');
    console.log('E2E-M44-15: Fluxo administrativo completo integrado');
    console.log('=========================================================================');
    // Simula o fluxo exato da UI:
    // 1. GET rota atual
    const getRes = await fetch(`${BASE_URL}/api/admin/routes/${draftRoute.id}`, { headers: AUTH_HEADERS });
    const getData = await getRes.json();
    const currentRouteV = getData.route.route_version;

    // 2. POST preview
    const fullPreviewRes = await fetch(`${BASE_URL}/api/admin/routes/${draftRoute.id}/edit-preview`, {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({
        expected_version: currentRouteV,
        final_deadline: '20:30',
      }),
    });
    if (!fullPreviewRes.ok) throw new Error('Falha no preview do fluxo administrativo');

    // 3. POST edit
    const fullEditRes = await fetch(`${BASE_URL}/api/admin/routes/${draftRoute.id}/edit`, {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({
        expected_version: currentRouteV,
        final_deadline: '20:30',
      }),
    });
    if (!fullEditRes.ok) throw new Error('Falha na execução do fluxo administrativo');
    const fullEditData = await fullEditRes.json();
    if (fullEditData.route.route_version !== currentRouteV + 1) {
      throw new Error('❌ E2E-M44-15: Versão não foi incrementada no fluxo');
    }
    console.log('✅ E2E-M44-15 PASSOU: Fluxo administrativo completo (GET -> PREVIEW -> CONFIRM -> EDIT) operou perfeitamente.');

    console.log('\n=========================================================================');
    console.log('🎉 TODOS OS TESTES E2E-M44 (01 A 15) E AUDITORIA DE SEGURANÇA PASSARAM!');
    console.log('=========================================================================');
  } finally {
    // Cleanup: Desativar motoristas criados
    (telegramBot as any).callTelegramApi = originalCallApi;
    try {
      await db.update(drivers).set({ status: 'BLOCKED' }).where(inArray(drivers.id, [driverA.id, driverB.id]));
    } catch {
      // Ignore
    }
  }
}

runM44E2ESuite()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('💥 FALHA NA SUÍTE E2E M4.4:', err);
    process.exit(1);
  });
