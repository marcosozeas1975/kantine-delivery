/**
 * M1.2 — Automated Verification Suite
 * Rede Fechada de Indicação e Convite de Novos Motoristas
 */

import { db } from '../src/db/index.ts';
import { drivers, driverReferrals, driverReferralEvents } from '../src/db/schema.ts';
import { referralService } from '../src/server/referralService.ts';
import { driverService } from '../src/server/driverService.ts';
import { telegramBot } from '../src/server/telegramBot.ts';
import { eq, desc } from 'drizzle-orm';

async function runM12Suite() {
  console.log('🚀 INICIANDO SUÍTE DE TESTES M1.2 — INDICAÇÃO CONTROLADA E CONVITE');

  // Setup services
  telegramBot.setDriverService(driverService);
  telegramBot.setReferralService(referralService);

  const timestamp = Date.now();

  // Create test drivers:
  // Driver A: ACTIVE
  const [driverA] = await db
    .insert(drivers)
    .values({
      telegram_user_id: `tg_active_${timestamp}`,
      telegram_chat_id: `chat_active_${timestamp}`,
      name: 'Marcos Ativo Silva',
      phone: '34991112233',
      vehicle_type: 'CAR_HATCH',
      pix_key_type: 'CPF',
      pix_key_value: '12345678909',
      status: 'ACTIVE',
    })
    .returning();

  // Driver B: PENDING
  const [driverB] = await db
    .insert(drivers)
    .values({
      telegram_user_id: `tg_pending_${timestamp}`,
      telegram_chat_id: `chat_pending_${timestamp}`,
      name: 'Paulo Pendente',
      phone: '34992223344',
      vehicle_type: 'MOTO_WITH_BAG',
      pix_key_type: 'PHONE',
      pix_key_value: '+5534992223344',
      status: 'PENDING',
    })
    .returning();

  // Driver C: BLOCKED
  const [driverC] = await db
    .insert(drivers)
    .values({
      telegram_user_id: `tg_blocked_${timestamp}`,
      telegram_chat_id: `chat_blocked_${timestamp}`,
      name: 'Bruno Bloqueado',
      phone: '34993334455',
      vehicle_type: 'CAR_SEDAN',
      pix_key_type: 'EMAIL',
      pix_key_value: 'bruno@email.com',
      status: 'BLOCKED',
    })
    .returning();

  console.log(`✅ Base de motoristas de teste criada (Ativo: #${driverA.id}, Pendente: #${driverB.id}, Bloqueado: #${driverC.id})`);

  // =========================================================================
  // TEST M1.2-T01: Regra de Elegibilidade Server-Side para Indicar
  // =========================================================================
  console.log('\n--- TEST M1.2-T01: Elegibilidade de Indicação (Apenas ACTIVE pode indicar) ---');
  try {
    await referralService.createReferral(driverB.id, 'Candidato Inválido', '34998887766');
    throw new Error('❌ Falha: Motorista PENDING conseguiu criar indicação!');
  } catch (err: any) {
    if (err.message.includes('DRIVER_NOT_ACTIVE_CANNOT_REFER')) {
      console.log('✅ PENDING corretamente rejeitado ao tentar indicar.');
    } else {
      throw err;
    }
  }

  try {
    await referralService.createReferral(driverC.id, 'Candidato Inválido', '34998887766');
    throw new Error('❌ Falha: Motorista BLOCKED conseguiu criar indicação!');
  } catch (err: any) {
    if (err.message.includes('DRIVER_NOT_ACTIVE_CANNOT_REFER')) {
      console.log('✅ BLOCKED corretamente rejeitado ao tentar indicar.');
    } else {
      throw err;
    }
  }

  try {
    await referralService.createReferral(999999, 'Candidato Inválido', '34998887766');
    throw new Error('❌ Falha: ID inexistente conseguiu criar indicação!');
  } catch (err: any) {
    if (err.message.includes('DRIVER_NOT_FOUND')) {
      console.log('✅ Motorista inexistente corretamente rejeitado.');
    } else {
      throw err;
    }
  }

  // =========================================================================
  // TEST M1.2-T02: Criação Válida de Indicação por Motorista ACTIVE
  // =========================================================================
  console.log('\n--- TEST M1.2-T02: Criação Válida de Indicação e Normalização de Telefone ---');
  const referral1 = await referralService.createReferral(
    driverA.id,
    'Carlos Silva Indicado',
    '(34) 99888-7711'
  );

  if (referral1.status !== 'PENDING_REVIEW') {
    throw new Error(`❌ Status inicial deveria ser PENDING_REVIEW, obteve ${referral1.status}`);
  }
  if (referral1.referred_phone !== '+5534998887711') {
    throw new Error(`❌ Telefone canônico incorreto: ${referral1.referred_phone}`);
  }
  if (referral1.invitation_token) {
    throw new Error('❌ Token de convite não deve ser gerado no momento da criação!');
  }

  // Check audit event
  const events1 = await referralService.getReferralEvents(referral1.id);
  if (!events1.some((e) => e.event_type === 'DRIVER_REFERRAL_CREATED')) {
    throw new Error('❌ Evento DRIVER_REFERRAL_CREATED não foi registrado!');
  }
  console.log('✅ Indicação criada com sucesso em PENDING_REVIEW com telefone normalizado e evento registrado.');

  // =========================================================================
  // TEST M1.2-T03: Visualização Administrativa & Proteção de Dados (NO PIX)
  // =========================================================================
  console.log('\n--- TEST M1.2-T03: Painel Administrativo e Privacidade do Indicador ---');
  const adminList = await referralService.getReferrals({ status: 'PENDING_REVIEW' });
  const foundRef = adminList.find((r) => r.id === referral1.id);
  if (!foundRef) throw new Error('❌ Indicação não listada para o administrador');

  if (!foundRef.referred_by_driver) {
    throw new Error('❌ Dados do indicador não carregados');
  }
  if (foundRef.referred_by_driver.name !== driverA.name) {
    throw new Error('❌ Nome do indicador divergente');
  }
  if (foundRef.referred_by_driver.vehicle_type !== 'CAR_HATCH') {
    throw new Error('❌ Tipo de veículo do indicador divergente');
  }
  if ((foundRef.referred_by_driver as any).pix_key || (foundRef.referred_by_driver as any).pix_key_value) {
    throw new Error('❌ VAZAMENTO DE DADOS: Chave Pix do indicador exposta no painel!');
  }
  console.log('✅ Dados administrativos e privacidade estrita confirmados (nome, status, veículo - SEM PIX).');

  // =========================================================================
  // TEST M1.2-T04: Recusa da Indicação (PENDING_REVIEW -> REJECTED)
  // =========================================================================
  console.log('\n--- TEST M1.2-T04: Recusa da Indicação pela Kantine ---');
  const referralToReject = await referralService.createReferral(
    driverA.id,
    'Lucas Recusado',
    '34997776655'
  );

  const rejected = await referralService.rejectReferral(
    referralToReject.id,
    'admin@kantine.com',
    'Frota de veículos completa no momento'
  );

  if (rejected.status !== 'REJECTED') {
    throw new Error(`❌ Status deveria ser REJECTED, obteve ${rejected.status}`);
  }
  if (rejected.rejection_reason !== 'Frota de veículos completa no momento') {
    throw new Error('❌ Motivo da recusa divergente');
  }
  if (rejected.invitation_token) {
    throw new Error('❌ Indicação recusada gerou convite indevidamente!');
  }

  const rejectEvents = await referralService.getReferralEvents(referralToReject.id);
  if (!rejectEvents.some((e) => e.event_type === 'DRIVER_REFERRAL_REJECTED')) {
    throw new Error('❌ Evento DRIVER_REFERRAL_REJECTED não registrado!');
  }
  console.log('✅ Indicação recusada com sucesso, motivo persistido e sem geração de convite.');

  // =========================================================================
  // TEST M1.2-T05: Aprovação da Indicação (PENDING_REVIEW -> APPROVED + 7 dias)
  // =========================================================================
  console.log('\n--- TEST M1.2-T05: Aprovação da Indicação e Token Criptográfico ---');
  const approvedRes = await referralService.approveReferral(referral1.id, 'admin@kantine.com');
  const approvedRef = approvedRes.referral;

  if (approvedRef.status !== 'APPROVED') {
    throw new Error(`❌ Status deveria ser APPROVED, obteve ${approvedRef.status}`);
  }
  if (!approvedRef.invitation_token || approvedRef.invitation_token.length < 16) {
    throw new Error('❌ Token de convite inválido ou ausente');
  }
  if (!approvedRef.invitation_expires_at) {
    throw new Error('❌ Prazo de expiração do convite ausente');
  }

  // Token expiration should be ~7 days from now
  const expiryDiffDays =
    (new Date(approvedRef.invitation_expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  if (expiryDiffDays < 6.9 || expiryDiffDays > 7.1) {
    throw new Error(`❌ Validade do convite fora do padrão de 7 dias: ${expiryDiffDays.toFixed(1)} dias`);
  }

  const approveEvents = await referralService.getReferralEvents(referral1.id);
  if (!approveEvents.some((e) => e.event_type === 'DRIVER_REFERRAL_APPROVED')) {
    throw new Error('❌ Evento DRIVER_REFERRAL_APPROVED não registrado!');
  }
  console.log(`✅ Indicação aprovada com token seguro [${approvedRef.invitation_token}] válido por 7 dias.`);

  // =========================================================================
  // TEST M1.2-T06: "Minhas Indicações" no Menu do Indicador
  // =========================================================================
  console.log('\n--- TEST M1.2-T06: Menu "Minhas Indicações" para o Motorista Indicador ---');
  const myReferrals = await referralService.getReferralsByDriverId(driverA.id);
  if (myReferrals.length < 2) {
    throw new Error(`❌ Deveria retornar 2 indicações do motorista A, retornou ${myReferrals.length}`);
  }

  const refApprovedItem = myReferrals.find((r) => r.id === referral1.id);
  if (!refApprovedItem || refApprovedItem.friendly_status !== 'APROVADA — AGUARDANDO CADASTRO') {
    throw new Error(`❌ Status amigável incorreto: ${refApprovedItem?.friendly_status}`);
  }
  if (!refApprovedItem.invite_link) {
    throw new Error('❌ Link de convite ausente em indicação aprovada');
  }

  const refRejectedItem = myReferrals.find((r) => r.id === referralToReject.id);
  if (!refRejectedItem || refRejectedItem.friendly_status !== 'NÃO APROVADA') {
    throw new Error(`❌ Status amigável incorreto para rejeitada: ${refRejectedItem?.friendly_status}`);
  }
  console.log('✅ Visualização de "Minhas Indicações" validada com mapeamento amigável.');

  // =========================================================================
  // TEST M1.2-T07: Rede Fechada — Usuário sem convite é barrado no /start
  // =========================================================================
  console.log('\n--- TEST M1.2-T07: Cadastro Livre Fechado (/start sem convite) ---');
  let capturedClosedMsg: any = null;
  const originalSend = telegramBot.sendMessage.bind(telegramBot);
  telegramBot.sendMessage = async (chatId: any, text: string) => {
    capturedClosedMsg = text;
    return true;
  };

  const unknownUserId = `tg_random_user_${timestamp}`;
  await telegramBot.handleUpdate({
    message: {
      message_id: 101,
      from: { id: unknownUserId },
      chat: { id: unknownUserId },
      text: '/start',
    },
  });

  if (!capturedClosedMsg || !String(capturedClosedMsg).includes('O cadastro de novos motoristas é realizado somente por convite')) {
    throw new Error(`❌ Usuário sem convite não foi barrado adequadamente! Mensagem: ${capturedClosedMsg}`);
  }
  console.log('✅ Usuário sem convite corretamente bloqueado no /start.');

  // =========================================================================
  // TEST M1.2-T08: Consumo do Convite & Vínculo com a Conta Telegram
  // =========================================================================
  console.log('\n--- TEST M1.2-T08: Consumo do Convite e Vínculo Atômico de Telegram User ID ---');
  const token = approvedRef.invitation_token!;
  const candidateCarlosId = `tg_candidate_carlos_${timestamp}`;

  // Carlos opens /start invite_<token>
  let welcomeMsg: any = null;
  telegramBot.sendMessage = async (chatId: any, text: string) => {
    welcomeMsg = text;
    return true;
  };

  await telegramBot.handleUpdate({
    message: {
      message_id: 102,
      from: { id: candidateCarlosId },
      chat: { id: candidateCarlosId },
      text: `/start invite_${token}`,
    },
  });

  if (!welcomeMsg || !String(welcomeMsg).includes('validado com sucesso')) {
    throw new Error(`❌ Convite não foi validado para Carlos! Mensagem: ${welcomeMsg}`);
  }

  // Verify referral is now bound to Carlos
  const consumedRef = await db
    .select()
    .from(driverReferrals)
    .where(eq(driverReferrals.id, referral1.id))
    .then((r) => r[0]);

  if (consumedRef.status !== 'INVITE_USED') {
    throw new Error(`❌ Status deveria ser INVITE_USED, obteve ${consumedRef.status}`);
  }
  if (consumedRef.invited_telegram_user_id !== candidateCarlosId) {
    throw new Error(`❌ invited_telegram_user_id divergente: ${consumedRef.invited_telegram_user_id}`);
  }

  // Attempt by a SECOND user (João) to consume the same token
  console.log('--- Testando tentativa de uso do mesmo convite por outro Telegram User (João) ---');
  const secondUserId = `tg_candidate_joao_${timestamp}`;
  let joaoMsg: any = null;
  telegramBot.sendMessage = async (chatId: any, text: string) => {
    joaoMsg = text;
    return true;
  };

  await telegramBot.handleUpdate({
    message: {
      message_id: 103,
      from: { id: secondUserId },
      chat: { id: secondUserId },
      text: `/start invite_${token}`,
    },
  });

  if (!joaoMsg || !String(joaoMsg).includes('já foi utilizado por outro usuário')) {
    throw new Error(`❌ João não foi impedido de usar o convite já consumido! Mensagem: ${joaoMsg}`);
  }
  console.log('✅ Segunda conta Telegram impedida de consumir o convite de Carlos.');

  // =========================================================================
  // TEST M1.2-T09: Conclusão do Cadastro (Cria PENDING) & Vínculo Resulting Driver
  // =========================================================================
  console.log('\n--- TEST M1.2-T09: Conclusão do Cadastro e Duas Decisões Distintas ---');
  // Carlos completes the registration wizard
  const registeredCandidate = await driverService.registerDriver({
    telegram_user_id: candidateCarlosId,
    telegram_chat_id: candidateCarlosId,
    name: 'Carlos Silva Indicado',
    phone: '34998887711',
    vehicle_type: 'CAR_SEDAN',
    pix_key_type: 'PHONE',
    pix_key_value: '34998887711',
    invite_token: token,
  });

  if (registeredCandidate.status !== 'PENDING') {
    throw new Error(`❌ O novo motorista indicado deveria nascer como PENDING, obteve ${registeredCandidate.status}`);
  }

  // Verify referral has resulting_driver_id linked
  const finalizedRef = await db
    .select()
    .from(driverReferrals)
    .where(eq(driverReferrals.id, referral1.id))
    .then((r) => r[0]);

  if (finalizedRef.resulting_driver_id !== registeredCandidate.id) {
    throw new Error(`❌ resulting_driver_id não foi associado ao novo motorista: ${finalizedRef.resulting_driver_id}`);
  }

  // Indicator sees "CADASTRO REALIZADO / EM ANÁLISE"
  let myRefsNow = await referralService.getReferralsByDriverId(driverA.id);
  let refItemNow = myRefsNow.find((r) => r.id === referral1.id);
  if (refItemNow?.friendly_status !== 'CADASTRO REALIZADO / EM ANÁLISE') {
    throw new Error(`❌ Status incorreto para candidato pendente: ${refItemNow?.friendly_status}`);
  }

  // Kantine approves candidate driver (second administrative decision)
  await driverService.approveDriver(registeredCandidate.id);

  // Now indicator sees "ATIVADO"
  myRefsNow = await referralService.getReferralsByDriverId(driverA.id);
  refItemNow = myRefsNow.find((r) => r.id === referral1.id);
  if (refItemNow?.friendly_status !== 'ATIVADO') {
    throw new Error(`❌ Status deveria evoluir para ATIVADO após aprovação cadastral, obteve: ${refItemNow?.friendly_status}`);
  }
  console.log('✅ Duas decisões comprovadas: Indicação aprovada -> Cadastro preenchido PENDING -> Admin ativa motorista -> Indicador vê ATIVADO.');

  // =========================================================================
  // TEST M1.2-T10: Expiração do Convite (7 dias)
  // =========================================================================
  console.log('\n--- TEST M1.2-T10: Expiração do Convite (7 dias) ---');
  // Create an expired referral
  const expiredRef = await referralService.createReferral(
    driverA.id,
    'José Expirado',
    '34995554433'
  );
  const expRes = await referralService.approveReferral(expiredRef.id, 'admin@kantine.com');

  // Manually backdate the expiration to the past
  await db
    .update(driverReferrals)
    .set({
      invitation_expires_at: new Date(Date.now() - 1000 * 60 * 60), // 1 hour ago
    })
    .where(eq(driverReferrals.id, expiredRef.id));

  // Try to consume expired token
  let expiredReply: any = null;
  telegramBot.sendMessage = async (chatId: any, text: string) => {
    expiredReply = text;
    return true;
  };

  const expiredUserAttempt = `tg_expired_user_${timestamp}`;
  await telegramBot.handleUpdate({
    message: {
      message_id: 104,
      from: { id: expiredUserAttempt },
      chat: { id: expiredUserAttempt },
      text: `/start invite_${expRes.referral.invitation_token}`,
    },
  });

  if (!expiredReply || !String(expiredReply).includes('Este convite expirou')) {
    throw new Error(`❌ Convite expirado não foi rejeitado! Mensagem: ${expiredReply}`);
  }

  // Verify referral is now EXPIRED in DB
  const checkExpDb = await db
    .select()
    .from(driverReferrals)
    .where(eq(driverReferrals.id, expiredRef.id))
    .then((r) => r[0]);

  if (checkExpDb.status !== 'EXPIRED') {
    throw new Error(`❌ Status do banco deveria ser EXPIRED, obteve ${checkExpDb.status}`);
  }
  console.log('✅ Expiração de convite após o prazo validada com mensagem e atualização no banco.');

  // Restore telegramBot.sendMessage
  telegramBot.sendMessage = originalSend;

  console.log('\n🎉 TODOS OS TESTES M1.2 (T01 a T10) PASSARAM COM SUCESSO TOTAL!');
}

runM12Suite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ ERRO NA EXECUÇÃO DA SUÍTE M1.2:', err);
    process.exit(1);
  });
