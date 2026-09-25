/**
 * M4.1 Automated Verification Suite
 * A. Correção da Indicação e Remoção de Default de Veículo (CAR_SEDAN)
 * B. Gestão Operacional de Falhas / Incidentes Não Resolvidos (⚠️ PENDÊNCIAS)
 * C. Gestão de Pagamentos das Corridas Concluídas aos Motoristas (💰 PAGAMENTOS)
 */

import { db, initDbConstraints } from '../src/db/index.ts';
import {
  drivers,
  routes,
  routeStops,
  routeEvents,
  driverReferrals,
  driverReferralEvents,
  driverEvents,
} from '../src/db/schema.ts';
import { routeService } from '../src/server/routeService.ts';
import { driverService } from '../src/server/driverService.ts';
import { referralService } from '../src/server/referralService.ts';
import { telegramBot } from '../src/server/telegramBot.ts';
import { eq } from 'drizzle-orm';
import { VehicleType, IncidentResolutionType } from '../src/server/types.ts';

async function runM41Suite() {
  console.log('🚀 INICIANDO SUÍTE DE TESTES M4.1 — CORREÇÃO DE INDICAÇÃO, PENDÊNCIAS E PAGAMENTOS\n');
  await initDbConstraints();

  const timestamp = Date.now();

  // Setup services
  telegramBot.setDriverService(driverService);
  telegramBot.setReferralService(referralService);
  telegramBot.setRouteService(routeService);

  // =========================================================================
  // PARTE A — CORREÇÃO DA INDICAÇÃO & REMOÇÃO DE DEFAULT DE VEÍCULO
  // =========================================================================
  console.log('=========================================================================');
  console.log('PARTE A: CORREÇÃO DA INDICAÇÃO & REMOÇÃO DE DEFAULT DE VEÍCULO');
  console.log('=========================================================================');

  // Test 1: Active Driver indicates a nominee (No vehicle is collected during referral)
  const [indicatorDriver] = await db
    .insert(drivers)
    .values({
      telegram_user_id: `tg_indicador_${timestamp}`,
      telegram_chat_id: `chat_indicador_${timestamp}`,
      name: 'Motorista Indicador M4.1',
      phone: '34991119999',
      vehicle_type: 'CAR_HATCH',
      pix_key_type: 'CPF',
      pix_key_value: '12345678909',
      status: 'ACTIVE',
    })
    .returning();

  const referral = await referralService.createReferral(
    indicatorDriver.id,
    'Novo Indicado M4.1',
    '34992228888'
  );

  console.log(`✅ Indicação criada (#${referral.id}). Nome: ${referral.referred_name}, Telefone: ${referral.referred_phone}`);

  // Kantine approves referral -> generates invite token
  const approvedRes = await referralService.approveReferral(referral.id, 'admin@kantine.com');
  const token = approvedRes.referral.invitation_token!;
  console.log(`✅ Indicação aprovada. Token de convite: [${token}]`);

  // Test 2: Nominee registers -> backend REJECTS completion if vehicle_type is missing or invalid
  const nomineeTgId = `tg_nominee_${timestamp}`;
  try {
    await driverService.registerDriver({
      telegram_user_id: nomineeTgId,
      telegram_chat_id: nomineeTgId,
      name: 'Novo Indicado M4.1',
      phone: '34992228888',
      vehicle_type: '' as any, // Missing / empty
      pix_key_type: 'PHONE',
      pix_key_value: '+5534992228888',
      invite_token: token,
    });
    throw new Error('❌ Falha: Cadastro sem veículo deveria ter sido rejeitado!');
  } catch (err: any) {
    if (err.message.includes('INVALID_VEHICLE_TYPE')) {
      console.log('✅ Cadastro sem vehicle_type estritamente rejeitado pelo backend.');
    } else {
      throw err;
    }
  }

  // Test 3: Nominee explicitly selects MOTO_WITH_BAG (NOT CAR_SEDAN)
  const registeredNominee = await driverService.registerDriver({
    telegram_user_id: nomineeTgId,
    telegram_chat_id: nomineeTgId,
    name: 'Novo Indicado M4.1',
    phone: '34992228888',
    vehicle_type: 'MOTO_WITH_BAG',
    pix_key_type: 'PHONE',
    pix_key_value: '+5534992228888',
    invite_token: token,
  });

  if (registeredNominee.vehicle_type !== 'MOTO_WITH_BAG') {
    throw new Error(`❌ Veículo deveria ser MOTO_WITH_BAG, obteve ${registeredNominee.vehicle_type}`);
  }
  console.log(`✅ Motorista indicado cadastrado com veículo explicitamente escolhido: [${registeredNominee.vehicle_type}]. Não sofreu fallback para CAR_SEDAN.`);

  // Test 4: Referral Vehicle Audit
  const auditList = await driverService.getReferralVehicleAudit();
  const nomineeAudit = auditList.find((a) => a.driver_id === registeredNominee.id);
  if (!nomineeAudit) {
    throw new Error('❌ Motorista originado de referral não consta no relatório de auditoria!');
  }
  if (nomineeAudit.is_potentially_affected) {
    throw new Error('❌ MOTO_WITH_BAG não deveria ser marcado como potencialmente afetado por CAR_SEDAN');
  }
  console.log('✅ Relatório de auditoria de veículos de indicados gerado com sucesso.');

  // Test 5: Administrative profile update allows explicitly correcting vehicle type
  const updatedDriver = await driverService.updateDriverProfile(
    registeredNominee.id,
    { vehicle_type: 'CAR_SW' },
    { actor_type: 'ADMIN', actor_id: 'admin@kantine.com' }
  );
  if (updatedDriver.vehicle_type !== 'CAR_SW') {
    throw new Error(`❌ Veículo deveria ter sido corrigido para CAR_SW, obteve ${updatedDriver.vehicle_type}`);
  }
  const updateEvents = await driverService.getDriverEvents(registeredNominee.id);
  if (!updateEvents.some((e) => e.field_changed === 'vehicle_type' && e.new_value === 'CAR_SW')) {
    throw new Error('❌ Evento de auditoria de correção de veículo não encontrado!');
  }
  console.log('✅ Correção administrativa explícita de veículo realizada com trilha de auditoria.');

  // =========================================================================
  // PARTE B — GESTÃO OPERACIONAL DE INCIDENTES (⚠️ PENDÊNCIAS)
  // =========================================================================
  console.log('\n=========================================================================');
  console.log('PARTE B: GESTÃO OPERACIONAL DE INCIDENTES NÃO RESOLVIDOS (⚠️ PENDÊNCIAS)');
  console.log('=========================================================================');

  // Activate indicator driver for route
  await db.update(drivers).set({ status: 'ACTIVE' }).where(eq(drivers.id, indicatorDriver.id));

  // Create test route with 2 stops
  const [routeWithIncident] = await db
    .insert(routes)
    .values({
      pickup_type: 'AD_HOC',
      pickup_name: 'Kantine Doceria Matriz',
      pickup_address: 'Rua Afonso Pena, 500',
      final_deadline: '19:00',
      total_fee: '42,50',
      accepted_vehicle_types: JSON.stringify(['CAR_HATCH', 'CAR_SEDAN', 'CAR_SW']),
      status: 'ACCEPTED',
      accepted_driver_id: indicatorDriver.id,
      accepted_at: new Date(),
    })
    .returning();

  const [stopSuccess] = await db
    .insert(routeStops)
    .values({
      route_id: routeWithIncident.id,
      sequence: 1,
      destination_address: 'Av. João Naves, 1200',
      destination_neighborhood: 'Saraiva',
      cargo_description: 'Kit Brigadeiros Gourmet',
      delivery_mode: 'IN_PERSON',
      pin_code: '1234',
      status: 'PENDING',
    })
    .returning();

  const [stopFailed] = await db
    .insert(routeStops)
    .values({
      route_id: routeWithIncident.id,
      sequence: 2,
      destination_address: 'Rua Olegário Maciel, 800',
      destination_neighborhood: 'Centro',
      cargo_description: 'Bolo de Festa 3kg',
      delivery_mode: 'IN_PERSON',
      pin_code: '5678',
      status: 'PENDING',
    })
    .returning();

  console.log(`Rota #${routeWithIncident.id} criada com 2 paradas.`);

  // Driver arrives, picks up, starts route
  await routeService.markArrivedPickup(routeWithIncident.id, { driverId: indicatorDriver.id });
  await routeService.markPickedUp(routeWithIncident.id, { driverId: indicatorDriver.id });
  await routeService.startRoute(routeWithIncident.id, { driverId: indicatorDriver.id });

  // Stop 1 delivered with PIN
  await routeService.deliverStopWithPin(stopSuccess.id, '1234', { driverId: indicatorDriver.id });
  console.log('✅ Parada #1 entregue com sucesso com PIN.');

  // Stop 2: Incident reported by driver (CLIENTE_AUSENTE)
  const incidentResult = await routeService.reportStopIncident(
    stopFailed.id,
    {
      incident_type: 'CLIENTE_AUSENTE',
      incident_note: 'Interfone sem resposta e portaria não autorizada a receber perecível',
    },
    { driverId: indicatorDriver.id }
  );

  if (!incidentResult.success) {
    throw new Error('❌ Falha ao reportar incidente');
  }

  // Check that incident_resolution_status was AUTOMATICALLY set to 'OPEN'
  const stopAfterIncident = await routeService.getStopById(stopFailed.id);
  if (stopAfterIncident?.incident_resolution_status !== 'OPEN') {
    throw new Error(
      `❌ incident_resolution_status deveria ser OPEN automaticamente, obteve ${stopAfterIncident?.incident_resolution_status}`
    );
  }
  console.log('✅ Incidente registrado na parada e incident_resolution_status = OPEN atribuído automaticamente.');

  // Verify that the route completed because all stops reached terminal state
  const completedRoute = await routeService.getRouteById(routeWithIncident.id);
  if (completedRoute?.status !== 'COMPLETED') {
    throw new Error(`❌ Rota deveria estar COMPLETED, obteve ${completedRoute?.status}`);
  }
  console.log('✅ Rota concluída com sucesso mesmo após incidente na parada final.');

  // Verify that incident appears in open incidents query for ⚠️ PENDÊNCIAS
  const openIncidents = await routeService.getIncidents({ resolution_status: 'OPEN' });
  const foundIncident = openIncidents.find((i) => i.stop.id === stopFailed.id);
  if (!foundIncident) {
    throw new Error('❌ Incidente aberto não listado em getIncidents({ resolution_status: "OPEN" })');
  }
  console.log('✅ Incidente localizado na consulta de pendências operacionais abertas.');

  // Admin resolves the incident (Section 10, 11): Destinação = RETURN_TO_ORIGIN
  const resolvedStop = await routeService.resolveStopIncident(stopFailed.id, {
    resolution_type: 'RETURN_TO_ORIGIN',
    resolution_note: 'Motorista orientado a devolver o bolo à Matriz até as 19:30',
    resolved_by: 'gerente@kantine.com',
  });

  if (resolvedStop.incident_resolution_status !== 'RESOLVED') {
    throw new Error(`❌ Status de resolução deveria ser RESOLVED, obteve ${resolvedStop.incident_resolution_status}`);
  }
  if (resolvedStop.resolution_type !== 'RETURN_TO_ORIGIN') {
    throw new Error(`❌ Tipo de resolução divergente: ${resolvedStop.resolution_type}`);
  }
  if (resolvedStop.incident_type !== 'CLIENTE_AUSENTE') {
    throw new Error('❌ O incidente original foi sobrescrito ou apagado!');
  }
  if (!resolvedStop.resolved_at || !resolvedStop.resolved_by) {
    throw new Error('❌ resolved_at ou resolved_by ausentes');
  }

  // Verify audit event STOP_INCIDENT_RESOLVED
  const auditEvents = await db
    .select()
    .from(routeEvents)
    .where(eq(routeEvents.route_id, routeWithIncident.id));
  if (!auditEvents.some((e) => e.event_type === 'STOP_INCIDENT_RESOLVED')) {
    throw new Error('❌ Evento STOP_INCIDENT_RESOLVED não encontrado no log de auditoria da rota!');
  }
  console.log('✅ Incidente resolvido com sucesso com destinação RETURN_TO_ORIGIN, preservando histórico original e log de auditoria.');

  // =========================================================================
  // PARTE C — GESTÃO DE PAGAMENTOS (💰 PAGAMENTOS)
  // =========================================================================
  console.log('\n=========================================================================');
  console.log('PARTE C: GESTÃO DE PAGAMENTOS DAS ROTAS CONCLUÍDAS (💰 PAGAMENTOS)');
  console.log('=========================================================================');

  // Verify route is initially payment_status = 'PENDING'
  if (completedRoute?.payment_status !== 'PENDING') {
    throw new Error(`❌ Rota concluída recém-criada deveria ter payment_status = PENDING, obteve ${completedRoute?.payment_status}`);
  }
  console.log('✅ Rota concluída inicializada com payment_status = PENDING.');

  // Attempt to pay a DRAFT route (Must fail)
  const [draftRoute] = await db
    .insert(routes)
    .values({
      pickup_type: 'AD_HOC',
      pickup_name: 'Kantine Matriz',
      pickup_address: 'Rua Afonso Pena, 500',
      final_deadline: '20:00',
      total_fee: '30,00',
      accepted_vehicle_types: JSON.stringify(['CAR_HATCH']),
      status: 'DRAFT',
    })
    .returning();

  try {
    await routeService.registerRoutePayment(draftRoute.id, { paid_by: 'financeiro@kantine.com' });
    throw new Error('❌ Falha: Rota DRAFT não deveria poder ser paga!');
  } catch (err: any) {
    if (err.message.includes('CANNOT_PAY_NON_COMPLETED_ROUTE')) {
      console.log('✅ Tentativa de pagamento de rota não concluída (DRAFT) corretamente rejeitada.');
    } else {
      throw err;
    }
  }

  // Register payment for completed route
  const paidRoute = await routeService.registerRoutePayment(routeWithIncident.id, {
    paid_by: 'financeiro@kantine.com',
    payment_method: 'PIX',
    payment_reference: 'PIX-E00416968-M41',
    payment_note: 'Repasse efetuado via app bancário Santander',
  });

  if (paidRoute.payment_status !== 'PAID') {
    throw new Error(`❌ Status de pagamento deveria ser PAID, obteve ${paidRoute.payment_status}`);
  }
  if (paidRoute.paid_by !== 'financeiro@kantine.com') {
    throw new Error(`❌ paid_by divergente: ${paidRoute.paid_by}`);
  }
  if (!paidRoute.paid_at) {
    throw new Error('❌ paid_at ausente após pagamento');
  }
  if (paidRoute.payment_reference !== 'PIX-E00416968-M41') {
    throw new Error(`❌ payment_reference divergente: ${paidRoute.payment_reference}`);
  }
  console.log(`✅ Pagamento da Rota #${routeWithIncident.id} registrado com sucesso: R$ ${paidRoute.total_fee} via ${paidRoute.payment_method}.`);

  // Verify payment audit event
  const payEvents = await db
    .select()
    .from(routeEvents)
    .where(eq(routeEvents.route_id, routeWithIncident.id));
  if (!payEvents.some((e) => e.event_type === 'ROUTE_PAYMENT_REGISTERED')) {
    throw new Error('❌ Evento ROUTE_PAYMENT_REGISTERED não encontrado na auditoria!');
  }
  console.log('✅ Evento de auditoria ROUTE_PAYMENT_REGISTERED registrado.');

  // Verify idempotency: duplicate payment attempt is rejected
  try {
    await routeService.registerRoutePayment(routeWithIncident.id, { paid_by: 'financeiro@kantine.com' });
    throw new Error('❌ Falha: Tentativa duplicada de pagamento deveria ser rejeitada!');
  } catch (err: any) {
    if (err.message.includes('ROUTE_ALREADY_PAID')) {
      console.log('✅ Idempotência validada: Pagamento duplicado estritamente rejeitado.');
    } else {
      throw err;
    }
  }

  // Verify financial summary & per-driver calculation in getPaymentsData
  const paymentsData = await routeService.getPaymentsData();
  if (paymentsData.summary.paidRoutesCount < 1) {
    throw new Error('❌ paidRoutesCount deveria ser pelo menos 1');
  }
  if (paymentsData.summary.totalPaidAmount <= 0) {
    throw new Error('❌ totalPaidAmount deveria ser maior que 0');
  }
  console.log(`✅ Resumo financeiro consolidado: Total Pago = R$ ${paymentsData.summary.totalPaidAmount.toFixed(2)}, Pendente = R$ ${paymentsData.summary.totalPendingAmount.toFixed(2)}.`);

  console.log('\n=========================================================================');
  console.log('🎉 TODOS OS TESTES DA SUÍTE M4.1 PASSARAM COM 100% DE SUCESSO!');
  console.log('=========================================================================');
  process.exit(0);
}

runM41Suite().catch((err) => {
  console.error('\n❌ ERRO NA EXECUÇÃO DA SUÍTE M4.1:', err);
  process.exit(1);
});
