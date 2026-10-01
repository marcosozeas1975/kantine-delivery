import { db } from '../src/db/index.ts';
import { drivers, driverEvents } from '../src/db/schema.ts';
import { eq, desc } from 'drizzle-orm';
import { driverService } from '../src/server/driverService.ts';
import { canReceiveDeliveryOffers } from '../src/server/eligibility.ts';

async function runTestSuite() {
  console.log('=== INICIANDO SUITE DE TESTES: CICLO DE VIDA DO MOTORISTA ===');
  console.log('Reativação, Exclusão, Reinclusão e Memória Histórica\n');

  const testSuffix = Date.now().toString().slice(-6);
  const telegramUserId = `test_driver_${testSuffix}`;
  const telegramChatId = `chat_${testSuffix}`;

  // 1. Cadastrar motorista de teste
  console.log('1. Cadastrando motorista para o teste...');
  const newDriver = await driverService.registerDriver({
    telegram_user_id: telegramUserId,
    telegram_chat_id: telegramChatId,
    name: `Motorista Teste ${testSuffix}`,
    phone: `(34) 98888-${testSuffix.slice(-4)}`,
    vehicle_type: 'CAR_HATCH',
    pix_key_type: 'EMAIL',
    pix_key_value: 'motorista.teste@kantine.com',
  });
  console.log(`   -> Motorista criado: #${newDriver.id} (Status: ${newDriver.status})`);

  // 2. Aprovar motorista
  console.log('2. Aprovando motorista...');
  const approvedDriver = await driverService.approveDriver(newDriver.id);
  if (approvedDriver.status !== 'ACTIVE' || !canReceiveDeliveryOffers(approvedDriver)) {
    throw new Error('Falha: motorista aprovado deveria estar ACTIVE e elegível');
  }
  console.log('   -> Motorista ativo e elegível para entregas.');

  // 3. Bloquear motorista
  console.log('3. Bloqueando motorista...');
  const blockedDriver = await driverService.blockDriver(newDriver.id);
  if (blockedDriver.status !== 'BLOCKED' || canReceiveDeliveryOffers(blockedDriver)) {
    throw new Error('Falha: motorista bloqueado não pode ser elegível para entregas');
  }
  console.log('   -> Motorista bloqueado.');

  // 4. Motorista bloqueado solicita reativação com justificativa
  console.log('4. Motorista bloqueado solicitando reativação...');
  const reqReactivation = await driverService.requestReactivation(
    newDriver.id,
    'Regularizei meu documento e gostaria de voltar a atender as entregas.'
  );
  if (!reqReactivation.reactivation_requested || reqReactivation.reactivation_reason !== 'Regularizei meu documento e gostaria de voltar a atender as entregas.') {
    throw new Error('Falha: solicitação de reativação não foi registrada corretamente');
  }
  console.log('   -> Solicitação de reativação registrada com sucesso.');

  // 5. Admin recusa solicitação de reativação
  console.log('5. Administrador recusando solicitação de reativação...');
  const rejectedReactivation = await driverService.rejectReactivation(
    newDriver.id,
    'Falta enviar o comprovante atualizado.',
    'admin@kantine.com'
  );
  if (rejectedReactivation.reactivation_requested !== false) {
    throw new Error('Falha: reactivation_requested deveria ser false após recusa');
  }
  console.log('   -> Recusa de reativação processada e registrada.');

  // 6. Admin reativa motorista
  console.log('6. Administrador reativando motorista...');
  const reactivatedDriver = await driverService.reactivateDriver(newDriver.id);
  if (reactivatedDriver.status !== 'ACTIVE' || !canReceiveDeliveryOffers(reactivatedDriver)) {
    throw new Error('Falha: motorista reativado deveria estar ACTIVE');
  }
  console.log('   -> Motorista reativado com sucesso.');

  // 7. Admin exclui motorista com motivo obrigatório
  console.log('7. Administrador excluindo motorista com motivo detalhado...');
  const exclusionReason = 'Motorista recusou reiteradas entregas sem aviso prévio.';
  const excludedDriver = await driverService.excludeDriver(
    newDriver.id,
    exclusionReason,
    'gerente@kantine.com'
  );
  if (
    excludedDriver.status !== 'EXCLUDED' ||
    !excludedDriver.is_excluded ||
    excludedDriver.exclusion_reason !== exclusionReason ||
    excludedDriver.previous_exclusion_reason !== exclusionReason ||
    excludedDriver.exclusion_count !== 1 ||
    canReceiveDeliveryOffers(excludedDriver)
  ) {
    throw new Error('Falha: exclusão do motorista não gravou todos os campos ou motorista permaneceu elegível');
  }
  console.log('   -> Motorista excluído e arquivado com memória histórica preservada.');

  // 8. Motorista excluído solicita reinclusão futura
  console.log('8. Motorista excluído solicitando reinclusão futura...');
  const reinclusionReason = 'Estou com nova rotina e agora tenho total disponibilidade no período vespertino.';
  const reqReinclusion = await driverService.requestReinclusion(newDriver.id, reinclusionReason);
  if (
    !reqReinclusion.reinclusion_requested ||
    reqReinclusion.reinclusion_reason !== reinclusionReason ||
    reqReinclusion.previous_exclusion_reason !== exclusionReason
  ) {
    throw new Error('Falha: pedido de reinclusão não gravou motivo ou apagou histórico de exclusão');
  }
  console.log('   -> Pedido de reinclusão registrado preservando memória histórica da exclusão.');

  // 9. Admin recusa reinclusão
  console.log('9. Administrador recusando primeiro pedido de reinclusão...');
  const rejectedReinclusion = await driverService.rejectReinclusion(
    newDriver.id,
    'Período vespertino já com cota completa de motoristas.',
    'diretoria@kantine.com'
  );
  if (rejectedReinclusion.reinclusion_requested !== false || rejectedReinclusion.status !== 'EXCLUDED') {
    throw new Error('Falha: motorista com reinclusão recusada deve permanecer EXCLUDED');
  }
  console.log('   -> Recusa registrada com sucesso.');

  // 10. Motorista solicita reinclusão novamente
  console.log('10. Motorista solicitando reinclusão novamente com nova justificativa...');
  const reinclusionReason2 = 'Tenho disponibilidade integral matutina e vespertina.';
  await driverService.requestReinclusion(newDriver.id, reinclusionReason2);

  // 11. Admin aprova reinclusão (volta para ACTIVE preservando memória histórica)
  console.log('11. Administrador aprovando reinclusão...');
  const approvedReinclusion = await driverService.approveReinclusion(
    newDriver.id,
    { targetStatus: 'ACTIVE', notes: 'Disponibilidade integral aprovada.' },
    'admin@kantine.com'
  );
  if (
    approvedReinclusion.status !== 'ACTIVE' ||
    approvedReinclusion.is_excluded !== false ||
    approvedReinclusion.reinclusion_requested !== false ||
    approvedReinclusion.previous_exclusion_reason !== exclusionReason ||
    approvedReinclusion.exclusion_count !== 1 ||
    !canReceiveDeliveryOffers(approvedReinclusion)
  ) {
    throw new Error('Falha: reinclusão aprovada deve restaurar status ACTIVE preservando histórico anterior');
  }
  console.log('   -> Reinclusão aprovada com sucesso! Memória histórica preservada:');
  console.log(`      • Total de exclusões históricas: ${approvedReinclusion.exclusion_count}`);
  console.log(`      • Motivo anterior registrado: "${approvedReinclusion.previous_exclusion_reason}"`);

  // 12. Validar auditoria completa de eventos
  console.log('12. Verificando log de auditoria completa em driver_events...');
  const events = await driverService.getDriverEvents(newDriver.id);
  const eventTypes = events.map((e) => e.event_type);
  console.log('   -> Eventos auditados no histórico:', eventTypes);

  const requiredEvents = [
    'DRIVER_REGISTERED',
    'DRIVER_APPROVED',
    'DRIVER_BLOCKED',
    'REACTIVATION_REQUESTED',
    'REACTIVATION_REJECTED',
    'DRIVER_REACTIVATED',
    'DRIVER_EXCLUDED',
    'REINCLUSION_REQUESTED',
    'REINCLUSION_REJECTED',
    'REINCLUSION_APPROVED',
  ];

  for (const reqType of requiredEvents) {
    if (!eventTypes.includes(reqType)) {
      throw new Error(`Falha: evento de auditoria obrigatório ausente: ${reqType}`);
    }
  }

  // Limpar registro de teste do banco
  console.log('13. Limpando registro de teste criado...');
  await db.delete(drivers).where(eq(drivers.id, newDriver.id));
  console.log('   -> Registro de teste limpo com sucesso.');

  console.log('\n======================================================');
  console.log('✅ TODOS OS TESTES PASSARAM COM 100% DE SUCESSO!');
  console.log('======================================================');
}

runTestSuite().catch((err) => {
  console.error('\n❌ ERRO NO TESTE:', err);
  process.exit(1);
});
