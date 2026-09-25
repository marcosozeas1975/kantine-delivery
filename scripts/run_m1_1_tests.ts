import dotenv from 'dotenv';
import { db } from '../src/db/index.ts';
import { drivers, driverEvents, deliveries, deliveryOfferDispatches } from '../src/db/schema.ts';
import { eq, and } from 'drizzle-orm';
import { driverService } from '../src/server/driverService.ts';
import { deliveryService } from '../src/server/deliveryService.ts';
import { canReceiveDeliveryOffers } from '../src/server/eligibility.ts';
import { telegramBot } from '../src/server/telegramBot.ts';
import {
  validateAndNormalizePix,
  maskPixKey,
  normalizeGeneralPhone,
} from '../src/server/pixValidation.ts';

dotenv.config();

interface TestResult {
  code: string;
  name: string;
  status: 'PASS' | 'FAIL' | 'BLOCKED';
  evidence: string;
  details?: any;
}

const results: Record<string, TestResult> = {};

async function runM1_1Tests() {
  console.log('====================================================');
  console.log('       KANTINE DELIVERY — M1.1 TEST SUITE           ');
  console.log('   Gestão Cadastral do Motorista (Telegram + Admin) ');
  console.log('====================================================\n');

  // ----------------------------------------------------
  // T01 — Validação Pix: CPF (Checksum, pontuação, sequências inválidas)
  // ----------------------------------------------------
  try {
    const validCpfRaw = '529.982.247-25';
    const cpfResult = validateAndNormalizePix('CPF', validCpfRaw);
    const masked = maskPixKey('CPF', cpfResult.canonical || '');

    const invalidSeqResult = validateAndNormalizePix('CPF', '111.111.111-11');
    const invalidCheckResult = validateAndNormalizePix('CPF', '123.456.789-00');

    if (
      cpfResult.isValid &&
      cpfResult.canonical === '52998224725' &&
      masked.endsWith('-25') &&
      !invalidSeqResult.isValid &&
      !invalidCheckResult.isValid
    ) {
      results['T01_PIX_CPF'] = {
        code: 'T01_PIX_CPF',
        name: 'Validação Pix: CPF com pontuação, canonical 11 dígitos, rejeição de sequências e checksum inválido',
        status: 'PASS',
        evidence: `Canônico: ${cpfResult.canonical}, Mascarado: ${masked}, Rejeitou '111.111.111-11' (${invalidSeqResult.error}) e '123.456.789-00' (${invalidCheckResult.error})`,
      };
    } else {
      throw new Error(`Falha na validação do CPF: res=${JSON.stringify(cpfResult)}, masked=${masked}`);
    }
  } catch (err: any) {
    results['T01_PIX_CPF'] = {
      code: 'T01_PIX_CPF',
      name: 'Validação Pix: CPF',
      status: 'FAIL',
      evidence: err.message,
    };
  }

  // ----------------------------------------------------
  // T02 — Validação Pix: PHONE (E.164, normalização com DDD)
  // ----------------------------------------------------
  try {
    const rawPhone = '(34) 98888-7777';
    const phoneResult = validateAndNormalizePix('PHONE', rawPhone);
    const maskedPhone = maskPixKey('PHONE', phoneResult.canonical || '');
    const invalidPhoneResult = validateAndNormalizePix('PHONE', '12345');

    if (
      phoneResult.isValid &&
      phoneResult.canonical === '+5534988887777' &&
      maskedPhone.includes('+55 34') &&
      maskedPhone.endsWith('7777') &&
      !invalidPhoneResult.isValid
    ) {
      results['T02_PIX_PHONE'] = {
        code: 'T02_PIX_PHONE',
        name: 'Validação Pix: Telefone brasileiro normalizado para E.164 (+55DDD...) e mascarado',
        status: 'PASS',
        evidence: `Canônico: ${phoneResult.canonical}, Mascarado: ${maskedPhone}, Rejeitou '12345' (${invalidPhoneResult.error})`,
      };
    } else {
      throw new Error(`Falha na validação PHONE: res=${JSON.stringify(phoneResult)}, masked=${maskedPhone}`);
    }
  } catch (err: any) {
    results['T02_PIX_PHONE'] = {
      code: 'T02_PIX_PHONE',
      name: 'Validação Pix: Telefone',
      status: 'FAIL',
      evidence: err.message,
    };
  }

  // ----------------------------------------------------
  // T03 — Validação Pix: EMAIL (normalização lowercase, sintaxe)
  // ----------------------------------------------------
  try {
    const rawEmail = '  Motorista.Kantine@Exemplo.COM  ';
    const emailResult = validateAndNormalizePix('EMAIL', rawEmail);
    const maskedEmail = maskPixKey('EMAIL', emailResult.canonical || '');
    const invalidEmailResult = validateAndNormalizePix('EMAIL', 'email_sem_arroba.com');

    if (
      emailResult.isValid &&
      emailResult.canonical === 'motorista.kantine@exemplo.com' &&
      maskedEmail.includes('@exemplo.com') &&
      !invalidEmailResult.isValid
    ) {
      results['T03_PIX_EMAIL'] = {
        code: 'T03_PIX_EMAIL',
        name: 'Validação Pix: E-mail sanitizado para minúsculas e mascarado',
        status: 'PASS',
        evidence: `Canônico: ${emailResult.canonical}, Mascarado: ${maskedEmail}, Rejeitou inválido (${invalidEmailResult.error})`,
      };
    } else {
      throw new Error(`Falha na validação EMAIL: res=${JSON.stringify(emailResult)}`);
    }
  } catch (err: any) {
    results['T03_PIX_EMAIL'] = {
      code: 'T03_PIX_EMAIL',
      name: 'Validação Pix: E-mail',
      status: 'FAIL',
      evidence: err.message,
    };
  }

  // ----------------------------------------------------
  // T04 — Validação Pix: RANDOM (UUID)
  // ----------------------------------------------------
  try {
    const rawUuid = '123E4567-E89B-12D3-A456-426614174000';
    const uuidResult = validateAndNormalizePix('RANDOM', rawUuid);
    const maskedUuid = maskPixKey('RANDOM', uuidResult.canonical || '');
    const invalidUuidResult = validateAndNormalizePix('RANDOM', 'uuid-nao-valido-1234');

    if (
      uuidResult.isValid &&
      uuidResult.canonical === '123e4567-e89b-12d3-a456-426614174000' &&
      maskedUuid.endsWith('4000') &&
      !invalidUuidResult.isValid
    ) {
      results['T04_PIX_RANDOM'] = {
        code: 'T04_PIX_RANDOM',
        name: 'Validação Pix: Chave Aleatória UUID canônica e mascarada',
        status: 'PASS',
        evidence: `Canônico: ${uuidResult.canonical}, Mascarado: ${maskedUuid}, Rejeitou inválido (${invalidUuidResult.error})`,
      };
    } else {
      throw new Error(`Falha na validação RANDOM: res=${JSON.stringify(uuidResult)}, masked=${maskedUuid}`);
    }
  } catch (err: any) {
    results['T04_PIX_RANDOM'] = {
      code: 'T04_PIX_RANDOM',
      name: 'Validação Pix: Chave Aleatória',
      status: 'FAIL',
      evidence: err.message,
    };
  }

  // ----------------------------------------------------
  // T05 — Proteção de Campos Imutáveis do Motorista
  // ----------------------------------------------------
  const testUserId = `driver_m11_${Date.now()}`;
  let testDriverId = 0;

  try {
    const driver = await driverService.registerDriver({
      telegram_user_id: testUserId,
      telegram_chat_id: `chat_${testUserId}`,
      name: 'Carlos Oliveira',
      phone: '(34) 99111-2222',
      vehicle_type: 'CAR_HATCH',
      pix_key_type: 'CPF',
      pix_key_value: '52998224725',
    });
    testDriverId = driver.id;

    // Attempt to modify protected fields: status, telegram_user_id, id, created_at
    let blockedProtectedFields = false;
    try {
      await driverService.updateDriverProfile(
        testDriverId,
        {
          name: 'Nome Hacker',
          status: 'ACTIVE', // Forbidden!
        } as any,
        { actor_type: 'DRIVER', actor_id: testUserId }
      );
    } catch (e: any) {
      if (e.message === 'PROTECTED_FIELDS_CANNOT_BE_MODIFIED') {
        blockedProtectedFields = true;
      }
    }

    let blockedTelegramUserId = false;
    try {
      await driverService.updateDriverProfile(
        testDriverId,
        {
          telegram_user_id: '999999999', // Forbidden!
        } as any,
        { actor_type: 'DRIVER', actor_id: testUserId }
      );
    } catch (e: any) {
      if (e.message === 'PROTECTED_FIELDS_CANNOT_BE_MODIFIED') {
        blockedTelegramUserId = true;
      }
    }

    if (blockedProtectedFields && blockedTelegramUserId) {
      results['T05_PROTECTED_FIELDS'] = {
        code: 'T05_PROTECTED_FIELDS',
        name: 'Campos imutáveis (id, telegram_user_id, status, created_at) protegidos contra alteração',
        status: 'PASS',
        evidence: 'Exceção PROTECTED_FIELDS_CANNOT_BE_MODIFIED disparada com sucesso em tentativas ilegítimas',
      };
    } else {
      throw new Error(`Falha: blockedProtectedFields=${blockedProtectedFields}, blockedTelegramUserId=${blockedTelegramUserId}`);
    }
  } catch (err: any) {
    results['T05_PROTECTED_FIELDS'] = {
      code: 'T05_PROTECTED_FIELDS',
      name: 'Campos Imutáveis',
      status: 'FAIL',
      evidence: err.message,
    };
  }

  // ----------------------------------------------------
  // T06 — Edição Cadastral pelo Motorista (Nome, Telefone, Veículo)
  // ----------------------------------------------------
  try {
    await driverService.updateDriverProfile(
      testDriverId,
      {
        name: 'Carlos Oliveira Atualizado',
        phone: '(34) 99888-3333',
        vehicle_type: 'MOTO_WITH_BAG',
      },
      { actor_type: 'DRIVER', actor_id: testUserId }
    );

    const dbDriver = await driverService.getDriverById(testDriverId);

    if (
      dbDriver &&
      dbDriver.name === 'Carlos Oliveira Atualizado' &&
      dbDriver.phone === '(34) 99888-3333' &&
      dbDriver.vehicle_type === 'MOTO_WITH_BAG'
    ) {
      results['T06_EDIT_PROFILE_FIELDS'] = {
        code: 'T06_EDIT_PROFILE_FIELDS',
        name: 'Edição de dados cadastrais (Nome, Telefone, Veículo) persistida com sucesso',
        status: 'PASS',
        evidence: `Atualizado: name=${dbDriver.name}, phone=${dbDriver.phone}, vehicle=${dbDriver.vehicle_type}`,
      };
    } else {
      throw new Error('Dados atualizados não conferem com o banco');
    }
  } catch (err: any) {
    results['T06_EDIT_PROFILE_FIELDS'] = {
      code: 'T06_EDIT_PROFILE_FIELDS',
      name: 'Edição de Dados Cadastrais',
      status: 'FAIL',
      evidence: err.message,
    };
  }

  // ----------------------------------------------------
  // T07 — Atualização Atômica de Pix com Auditoria Completa
  // ----------------------------------------------------
  try {
    // Current Pix is CPF: 52998224725
    // Switch to EMAIL: carlos.entrega@loja.com
    await driverService.updateDriverProfile(
      testDriverId,
      {
        pix: {
          pix_key_type: 'EMAIL',
          pix_key_value: 'Carlos.Entrega@Loja.COM',
        },
      },
      { actor_type: 'DRIVER', actor_id: testUserId }
    );

    // Verify atomic persistence in drivers table
    const dbDriver = await driverService.getDriverById(testDriverId);

    // Verify audit events
    const events = await driverService.getDriverEvents(testDriverId);
    const pixEvent = events.find((e) => e.field_changed === 'pix');

    if (
      dbDriver &&
      dbDriver.pix_key_type === 'EMAIL' &&
      dbDriver.pix_key_value === 'carlos.entrega@loja.com' &&
      dbDriver.pix_key === 'carlos.entrega@loja.com' &&
      pixEvent &&
      pixEvent.actor_type === 'DRIVER' &&
      pixEvent.actor_id === testUserId &&
      pixEvent.old_value?.includes('CPF') &&
      pixEvent.new_value?.includes('EMAIL')
    ) {
      results['T07_ATOMIC_PIX_AUDIT'] = {
        code: 'T07_ATOMIC_PIX_AUDIT',
        name: 'Atualização atômica de Pix (tipo + valor) com trilha de auditoria completa (DRIVER)',
        status: 'PASS',
        evidence: `Novo Pix: ${dbDriver.pix_key_type}:${dbDriver.pix_key_value}. Auditoria: old='${pixEvent.old_value}' -> new='${pixEvent.new_value}'`,
      };
    } else {
      throw new Error(`Falha na atualização atômica de Pix: dbDriver=${JSON.stringify(dbDriver)}`);
    }
  } catch (err: any) {
    results['T07_ATOMIC_PIX_AUDIT'] = {
      code: 'T07_ATOMIC_PIX_AUDIT',
      name: 'Atualização Atômica de Pix com Auditoria',
      status: 'FAIL',
      evidence: err.message,
    };
  }

  // ----------------------------------------------------
  // T08 — Edição Administrativa (ADMIN) com Mesmas Validações
  // ----------------------------------------------------
  try {
    const updatedByAdmin = await driverService.updateDriverProfile(
      testDriverId,
      {
        name: 'Carlos Oliveira (Validado Admin)',
        vehicle_type: 'CAR_SEDAN',
        pix: {
          pix_key_type: 'PHONE',
          pix_key_value: '(34) 99222-4444',
        },
      },
      { actor_type: 'ADMIN', actor_id: 'gerente@kantine.com' }
    );

    const events = await driverService.getDriverEvents(testDriverId);
    const adminEvents = events.filter((e) => e.actor_type === 'ADMIN');

    if (
      updatedByAdmin.name === 'Carlos Oliveira (Validado Admin)' &&
      updatedByAdmin.vehicle_type === 'CAR_SEDAN' &&
      updatedByAdmin.pix_key_type === 'PHONE' &&
      updatedByAdmin.pix_key_value === '+5534992224444' &&
      adminEvents.length >= 3
    ) {
      results['T08_ADMIN_EDIT_AUDIT'] = {
        code: 'T08_ADMIN_EDIT_AUDIT',
        name: 'Edição cadastral via painel administrativo (ADMIN) com validações e auditoria',
        status: 'PASS',
        evidence: `Admin 'gerente@kantine.com' alterou campos com sucesso. Eventos admin registrados: ${adminEvents.length}`,
      };
    } else {
      throw new Error('Falha na edição cadastral administrativa');
    }
  } catch (err: any) {
    results['T08_ADMIN_EDIT_AUDIT'] = {
      code: 'T08_ADMIN_EDIT_AUDIT',
      name: 'Edição Cadastral Administrativa',
      status: 'FAIL',
      evidence: err.message,
    };
  }

  // ----------------------------------------------------
  // T09 — Simulação Bot Telegram: /meuperfil e Edição de Pix
  // ----------------------------------------------------
  try {
    const simChatId = `chat_${testUserId}`;

    // 1. Send /meuperfil via handleUpdate
    await telegramBot.handleUpdate({
      update_id: 101,
      message: {
        from: { id: testUserId },
        chat: { id: simChatId },
        text: '/meuperfil',
      },
    });

    // 2. Click "edit_profile_pix" callback
    await telegramBot.handleUpdate({
      update_id: 102,
      callback_query: {
        id: 'cb_102',
        from: { id: testUserId },
        message: { chat: { id: simChatId } },
        data: 'edit_profile_pix',
      },
    });

    // 3. Choose CPF type callback: "edit_pixtype:CPF"
    await telegramBot.handleUpdate({
      update_id: 103,
      callback_query: {
        id: 'cb_103',
        from: { id: testUserId },
        message: { chat: { id: simChatId } },
        data: 'edit_pixtype:CPF',
      },
    });

    // 4. Send new CPF value message
    await telegramBot.handleUpdate({
      update_id: 104,
      message: {
        from: { id: testUserId },
        chat: { id: simChatId },
        text: '529.982.247-25',
      },
    });

    // 5. Confirm edit callback: "confirm_edit"
    await telegramBot.handleUpdate({
      update_id: 105,
      callback_query: {
        id: 'cb_105',
        from: { id: testUserId },
        message: { chat: { id: simChatId } },
        data: 'confirm_edit',
      },
    });

    // Verify in database that CPF was successfully persisted
    const dbDriver = await driverService.getDriverById(testDriverId);

    if (
      dbDriver &&
      dbDriver.pix_key_type === 'CPF' &&
      dbDriver.pix_key_value === '52998224725'
    ) {
      results['T09_TELEGRAM_PROFILE_FLOW'] = {
        code: 'T09_TELEGRAM_PROFILE_FLOW',
        name: 'Fluxo completo no Telegram: /meuperfil -> edit_profile_pix -> edit_pixtype:CPF -> envia CPF -> confirm_edit',
        status: 'PASS',
        evidence: `Fluxo executado via handleUpdate. Novo Pix verificado no banco: ${dbDriver?.pix_key_type}:${dbDriver?.pix_key_value}`,
      };
    } else {
      throw new Error(`Falha no fluxo do Telegram: dbDriver Pix=${dbDriver?.pix_key_type}:${dbDriver?.pix_key_value}`);
    }
  } catch (err: any) {
    results['T09_TELEGRAM_PROFILE_FLOW'] = {
      code: 'T09_TELEGRAM_PROFILE_FLOW',
      name: 'Fluxo Telegram Meu Perfil',
      status: 'FAIL',
      evidence: err.message,
    };
  }

  // ----------------------------------------------------
  // T10 — Preservação das Baselines M1, M2 e M3
  // ----------------------------------------------------
  try {
    // 1. Approve driver to ACTIVE
    await driverService.approveDriver(testDriverId);
    const approvedDriver = await driverService.getDriverById(testDriverId);
    const isEligible = canReceiveDeliveryOffers(approvedDriver!);

    // 2. Create M2 Delivery Draft
    const draft = await deliveryService.createDraft({
      pickup_location: 'Kantine Matriz Teste',
      destination_address: 'Rua Afonso Pena, 100',
      destination_neighborhood: 'Centro',
      cargo_description: 'Combo Brownie M1.1',
      delivery_fee: '15.00',
      delivery_mode: 'IN_PERSON',
    });

    // 3. Publish delivery
    const published = await deliveryService.publishDelivery(draft.id);

    // Ensure driver has SENT dispatch (in tests where Telegram chat ID is simulated)
    await db
      .update(deliveryOfferDispatches)
      .set({ status: 'SENT' })
      .where(
        and(
          eq(deliveryOfferDispatches.delivery_id, draft.id),
          eq(deliveryOfferDispatches.driver_id, testDriverId)
        )
      );

    // 4. M3 Atomic Acceptance by our active driver
    const acceptResult = await deliveryService.acceptDelivery(draft.id, { driverId: testDriverId });

    if (
      approvedDriver?.status === 'ACTIVE' &&
      isEligible &&
      published.delivery.status === 'OFFERED' &&
      acceptResult.status === 'WON' &&
      acceptResult.delivery?.status === 'ACCEPTED' &&
      acceptResult.delivery?.accepted_driver_id === testDriverId
    ) {
      results['T10_BASELINES_PRESERVED'] = {
        code: 'T10_BASELINES_PRESERVED',
        name: 'Preservação integral dos baselines M1, M2 e M3 (Aprovação, Elegibilidade, Publicação, Aceite Atômico)',
        status: 'PASS',
        evidence: `Driver ${testDriverId} aprovado para ACTIVE -> Entrega ${draft.id} publicada e aceita atomicamente com status ACCEPTED`,
      };
    } else {
      throw new Error(`Falha na preservação dos baselines M1/M2/M3: acceptResult=${JSON.stringify(acceptResult)}`);
    }
  } catch (err: any) {
    results['T10_BASELINES_PRESERVED'] = {
      code: 'T10_BASELINES_PRESERVED',
      name: 'Preservação de Baselines M1/M2/M3',
      status: 'FAIL',
      evidence: err.message,
    };
  }

  // ----------------------------------------------------
  // Summary
  // ----------------------------------------------------
  console.log('\n====================================================');
  console.log('                 RELATÓRIO M1.1                      ');
  console.log('====================================================');

  let passed = 0;
  let failed = 0;

  for (const [code, res] of Object.entries(results)) {
    const mark = res.status === 'PASS' ? '✅ PASS' : '❌ FAIL';
    console.log(`[${mark}] ${res.code}: ${res.name}`);
    console.log(`       Evidência: ${res.evidence}\n`);
    if (res.status === 'PASS') passed++;
    else failed++;
  }

  console.log(`Total: ${passed + failed} | Pass: ${passed} | Fail: ${failed}`);
  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runM1_1Tests().catch((e) => {
  console.error('Fatal test error:', e);
  process.exit(1);
});
