/**
 * Automated Verification Suite for:
 * CORREÇÃO PONTUAL — EXIBIR BAIRRO DA RETIRADA NAS OFERTAS
 *
 * Tests:
 * - PICKUP-N01: ponto cadastrado (Kantine Matriz / Centro) -> Telegram com Bairro da Retirada
 * - PICKUP-N02: coleta avulsa com bairro -> Bairro da retirada exibido na oferta
 * - PICKUP-N03: privacidade -> Exibe bairros mas NUNCA endereços completos antes do aceite
 * - PICKUP-N04: snapshot -> Alteração cadastral posterior não afeta rota histórica; nova rota reflete alteração
 * - PICKUP-N05: ausência de bairro -> Publicação bloqueada com mensagem administrativa clara
 */

import { db, initDbConstraints } from '../src/db/index.ts';
import {
  drivers,
  pickupLocations,
  routes,
  routeStops,
} from '../src/db/schema.ts';
import { routeService } from '../src/server/routeService.ts';
import { driverService } from '../src/server/driverService.ts';
import { telegramBot } from '../src/server/telegramBot.ts';
import { eq } from 'drizzle-orm';

async function runPickupNeighborhoodTests() {
  console.log('🚀 INICIANDO TESTES: EXIBIR BAIRRO DA RETIRADA NAS OFERTAS\n');
  await initDbConstraints();

  const timestamp = Date.now();
  telegramBot.setDriverService(driverService);
  telegramBot.setRouteService(routeService);

  // Hook into callTelegramApi or spy on message dispatches to verify exact Telegram message content
  const sentTelegramMessages: Array<{ chatId: string | number; text: string; parse_mode?: string }> = [];
  const originalCallTelegramApi = (telegramBot as any).callTelegramApi?.bind(telegramBot);

  if (originalCallTelegramApi) {
    (telegramBot as any).callTelegramApi = async (method: string, body?: any) => {
      if (method === 'sendMessage' && body) {
        sentTelegramMessages.push({
          chatId: body.chat_id,
          text: body.text,
          parse_mode: body.parse_mode,
        });
      }
      try {
        return await originalCallTelegramApi(method, body);
      } catch (err: any) {
        // If external API call fails due to invalid chat in synthetic test, return simulated message_id
        return { message_id: 123456 };
      }
    };
  }

  // Ensure an active test driver exists for dispatch
  const [testDriver] = await db
    .insert(drivers)
    .values({
      telegram_user_id: `tg_driver_test_${timestamp}`,
      telegram_chat_id: `chat_driver_test_${timestamp}`,
      name: 'Motorista Homologação Bairro',
      phone: '34991112222',
      vehicle_type: 'CAR_HATCH',
      pix_key_type: 'CPF',
      pix_key_value: '11122233344',
      status: 'ACTIVE',
    })
    .returning();

  console.log(`[Setup] Motorista ativo criado: #${testDriver.id} (${testDriver.name})`);

  // =========================================================================
  // TESTE PICKUP-N05: Ausência de bairro bloqueia publicação
  // =========================================================================
  console.log('\n--- EXECUTANDO TESTE PICKUP-N05: Ausência de bairro bloqueia publicação ---');

  // Criar ponto sem bairro estruturado
  const [locNoNeighborhood] = await db
    .insert(pickupLocations)
    .values({
      name: `Kantine Sem Bairro ${timestamp}`,
      address: 'Rua das Flores, 123',
      neighborhood: null,
      active: true,
    })
    .returning();

  // Criar rota DRAFT usando este ponto sem bairro
  const draftNoNeighborhood = await routeService.createDraft({
    pickup_type: 'REGISTERED',
    pickup_location_id: locNoNeighborhood.id,
    final_deadline: '19:00',
    total_fee: '40,00',
    accepted_vehicle_types: ['CAR_HATCH'],
    stops: [
      {
        destination_address: 'Av. Brasil, 500',
        destination_neighborhood: 'Umuarama',
        cargo_description: 'Bolo Aniversário',
      },
    ],
  });

  let blockedCorrectly = false;
  let blockErrorMessage = '';

  try {
    await routeService.publishRoute(draftNoNeighborhood.id, 'admin@kantine.com');
  } catch (err: any) {
    blockedCorrectly = true;
    blockErrorMessage = err.message;
  }

  if (!blockedCorrectly || !blockErrorMessage.includes('NEIGHBORHOOD_REQUIRED_FOR_PUBLICATION')) {
    throw new Error(`❌ PICKUP-N05 FALHOU: Deveria bloquear publicação de ponto sem bairro. Erro retornado: ${blockErrorMessage}`);
  }
  console.log(`✅ PICKUP-N05 PASSOU: Publicação bloqueada com sucesso! Mensagem: "${blockErrorMessage}"`);

  // =========================================================================
  // TESTE PICKUP-N01: Ponto cadastrado com Nome: Kantine Matriz, Bairro: Centro
  // =========================================================================
  console.log('\n--- EXECUTANDO TESTE PICKUP-N01: Ponto cadastrado com Nome e Bairro ---');

  // Criar ou atualizar ponto com Nome: Kantine Matriz, Bairro: Centro
  const [locMatriz] = await db
    .insert(pickupLocations)
    .values({
      name: `Kantine Matriz Teste ${timestamp}`,
      address: 'Avenida Getúlio Vargas 1846, Uberlândia - MG',
      neighborhood: 'Centro',
      active: true,
    })
    .returning();

  const routeRegistered = await routeService.createDraft({
    pickup_type: 'REGISTERED',
    pickup_location_id: locMatriz.id,
    final_deadline: '19:30',
    total_fee: '50,00',
    accepted_vehicle_types: ['CAR_HATCH'],
    stops: [
      {
        destination_address: 'Rua Tiradentes, 100',
        destination_neighborhood: 'Centro',
        cargo_description: 'Cesta Café Especial',
      },
      {
        destination_address: 'Av. Floriano Peixoto, 200',
        destination_neighborhood: 'Santa Mônica',
        cargo_description: 'Bolo Red Velvet',
      },
    ],
  });

  if (routeRegistered.pickup_neighborhood_snapshot !== 'Centro') {
    throw new Error(`❌ Snapshot na criação deveria ser 'Centro', mas veio '${routeRegistered.pickup_neighborhood_snapshot}'`);
  }

  sentTelegramMessages.length = 0; // Limpar histórico
  const publishRegistered = await routeService.publishRoute(routeRegistered.id, 'admin@kantine.com');

  if (publishRegistered.route.status !== 'OFFERED') {
    throw new Error(`❌ Rota deveria estar com status OFFERED, mas está ${publishRegistered.route.status}`);
  }

  // Verificar mensagem gerada
  const offerMsgRegistered = sentTelegramMessages[0]?.text || '';
  console.log(`[Telegram Mensagem Capturada]\n${offerMsgRegistered}`);

  if (!offerMsgRegistered.includes(locMatriz.name)) {
    throw new Error(`❌ Mensagem do Telegram não contém nome da retirada: ${locMatriz.name}`);
  }
  if (!offerMsgRegistered.includes('Bairro: Centro')) {
    throw new Error(`❌ Mensagem do Telegram não contém 'Bairro: Centro'! Mensagem:\n${offerMsgRegistered}`);
  }
  if (!offerMsgRegistered.includes('1️⃣ Centro') || !offerMsgRegistered.includes('2️⃣ Santa Mônica')) {
    throw new Error(`❌ Mensagem do Telegram não contém paradas esperadas (Centro, Santa Mônica)!`);
  }

  console.log('✅ PICKUP-N01 PASSOU: Mensagem Telegram contém Nome e Bairro da retirada com fidelidade total!');

  // =========================================================================
  // TESTE PICKUP-N02: Coleta avulsa informando bairro
  // =========================================================================
  console.log('\n--- EXECUTANDO TESTE PICKUP-N02: Coleta avulsa informando bairro ---');

  const routeAdHoc = await routeService.createDraft({
    pickup_type: 'AD_HOC',
    pickup_name: 'Espaço Gourmet Eventos',
    pickup_address: 'Rua Olegário Maciel, 800',
    pickup_neighborhood: 'Fundinho',
    final_deadline: '20:00',
    total_fee: '45,00',
    accepted_vehicle_types: ['CAR_HATCH'],
    stops: [
      {
        destination_address: 'Av. Nicomedes, 400',
        destination_neighborhood: 'Morada da Colina',
        cargo_description: 'Doces Finos',
      },
    ],
  });

  if (routeAdHoc.pickup_neighborhood_snapshot !== 'Fundinho') {
    throw new Error(`❌ Snapshot de coleta avulsa deveria ser 'Fundinho', mas veio '${routeAdHoc.pickup_neighborhood_snapshot}'`);
  }

  sentTelegramMessages.length = 0;
  await routeService.publishRoute(routeAdHoc.id, 'admin@kantine.com');

  const offerMsgAdHoc = sentTelegramMessages[0]?.text || '';
  console.log(`[Telegram Mensagem Avulsa Capturada]\n${offerMsgAdHoc}`);

  if (!offerMsgAdHoc.includes('Espaço Gourmet Eventos') || !offerMsgAdHoc.includes('Bairro: Fundinho')) {
    throw new Error(`❌ Mensagem para coleta avulsa não exibiu o bairro corretamente! Mensagem:\n${offerMsgAdHoc}`);
  }

  console.log('✅ PICKUP-N02 PASSOU: Coleta avulsa com bairro exibido corretamente na oferta!');

  // =========================================================================
  // TESTE PICKUP-N03: Privacidade estrita antes do aceite
  // =========================================================================
  console.log('\n--- EXECUTANDO TESTE PICKUP-N03: Privacidade estrita antes do aceite ---');

  // Na mensagem do teste PICKUP-N01:
  // Destinos eram 'Rua Tiradentes, 100' e 'Av. Floriano Peixoto, 200'
  if (offerMsgRegistered.includes('Rua Tiradentes, 100') || offerMsgRegistered.includes('Av. Floriano Peixoto, 200')) {
    throw new Error(`❌ VIOLAÇÃO DE PRIVACIDADE: Endereço completo de destino vazou na oferta antes do aceite!`);
  }
  // Coleta: endereço completo 'Avenida Getúlio Vargas 1846' não deve estar na pré-oferta
  if (offerMsgRegistered.includes('Avenida Getúlio Vargas 1846')) {
    throw new Error(`❌ VIOLAÇÃO DE PRIVACIDADE: Endereço de rua da coleta não deveria aparecer na pré-oferta!`);
  }

  console.log('✅ PICKUP-N03 PASSOU: Privacidade preservada! O motorista vê apenas nome da retirada, bairro da retirada e bairros dos destinos.');

  // =========================================================================
  // TESTE PICKUP-N04: Preservação de Snapshot na rota
  // =========================================================================
  console.log('\n--- EXECUTANDO TESTE PICKUP-N04: Preservação de Snapshot na rota ---');

  // Criar ponto com Bairro = Centro
  const [locSnapshotTest] = await db
    .insert(pickupLocations)
    .values({
      name: `Kantine Snapshot Loja ${timestamp}`,
      address: 'Rua Santos Dumont, 300',
      neighborhood: 'Centro',
      active: true,
    })
    .returning();

  // Criar e publicar rota 1
  const route1 = await routeService.createDraft({
    pickup_type: 'REGISTERED',
    pickup_location_id: locSnapshotTest.id,
    final_deadline: '18:00',
    total_fee: '35,00',
    accepted_vehicle_types: ['CAR_HATCH'],
    stops: [
      {
        destination_address: 'Av. Cesário Alvim, 10',
        destination_neighborhood: 'Centro',
        cargo_description: 'Torta Salgada',
      },
    ],
  });
  await routeService.publishRoute(route1.id, 'admin@kantine.com');

  // Alterar cadastro do ponto de coleta para 'Fundinho'
  await routeService.updatePickupLocation(locSnapshotTest.id, {
    neighborhood: 'Fundinho',
  });
  console.log(`[Ponto de Coleta #${locSnapshotTest.id}] Cadastro alterado para Bairro: 'Fundinho'`);

  // Verificar Rota 1 histórica: deve CONTINUAR como 'Centro'
  const route1After = await routeService.getRouteById(route1.id);
  if (route1After?.pickup_neighborhood_snapshot !== 'Centro') {
    throw new Error(`❌ SNAPSHOT QUEBRADO: Rota histórica #${route1.id} mudou para '${route1After?.pickup_neighborhood_snapshot}', deveria permanecer 'Centro'!`);
  }
  console.log(`✅ Rota histórica #${route1.id} permaneceu intacta com snapshot: '${route1After.pickup_neighborhood_snapshot}'`);

  // Criar Rota 2 nova usando o mesmo ponto agora atualizado
  const route2 = await routeService.createDraft({
    pickup_type: 'REGISTERED',
    pickup_location_id: locSnapshotTest.id,
    final_deadline: '19:00',
    total_fee: '38,00',
    accepted_vehicle_types: ['CAR_HATCH'],
    stops: [
      {
        destination_address: 'Av. Cesário Alvim, 20',
        destination_neighborhood: 'Brasil',
        cargo_description: 'Bolo Cenoura',
      },
    ],
  });
  await routeService.publishRoute(route2.id, 'admin@kantine.com');

  const route2After = await routeService.getRouteById(route2.id);
  if (route2After?.pickup_neighborhood_snapshot !== 'Fundinho') {
    throw new Error(`❌ Nova rota #${route2.id} deveria usar o novo bairro 'Fundinho', mas veio '${route2After?.pickup_neighborhood_snapshot}'`);
  }
  console.log(`✅ Nova rota #${route2.id} registrou snapshot do novo bairro: '${route2After.pickup_neighborhood_snapshot}'`);

  console.log('✅ PICKUP-N04 PASSOU: Preservação de snapshot validada sem contaminação entre rotas!');

  // =========================================================================
  // TESTE PÓS-ACEITE: Fluxo completo após aceite com dados completos
  // =========================================================================
  console.log('\n--- EXECUTANDO TESTE: Envio de confirmação pós-aceite com dados de coleta ---');

  sentTelegramMessages.length = 0;
  // Simular aceite pelo motorista
  const acceptResult = await routeService.acceptRoute(route1.id, {
    telegramUserId: testDriver.telegram_user_id,
  });

  if (acceptResult.status === 'WON' && acceptResult.route) {
    await telegramBot.sendRouteAcceptedWon(testDriver.telegram_chat_id, acceptResult.route);
    const postAcceptMsg = sentTelegramMessages[0]?.text || '';
    console.log(`[Telegram Mensagem Pós-Aceite Capturada]\n${postAcceptMsg}`);

    if (!postAcceptMsg.includes('ROTA #') || !postAcceptMsg.includes(locSnapshotTest.name) || !postAcceptMsg.includes(locSnapshotTest.address)) {
      throw new Error(`❌ Mensagem pós-aceite incompleta:\n${postAcceptMsg}`);
    }
    console.log('✅ Fluxo pós-aceite validado: motorista vencedor recebe dados completos da coleta!');
  } else {
    throw new Error(`❌ Falha no aceite da rota: ${acceptResult.status} ${acceptResult.error || ''}`);
  }

  console.log('\n=========================================================================');
  console.log('🎉 TODOS OS TESTES PICKUP-N01 A PICKUP-N05 PASSARAM COM SUCESSO TOTAL!');
  console.log('=========================================================================');
}

runPickupNeighborhoodTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ ERRO NA EXECUÇÃO DOS TESTES:', err);
    process.exit(1);
  });
