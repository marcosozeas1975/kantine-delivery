/**
 * M4.2 Automated Verification Suite
 * - Modalidades de Entrega
 * - Categorias Tarifárias (CAR, MOTO, MOTO_WITH_BAG)
 * - Bairros & Normalização
 * - Tabela de Fretes / Matriz Tarifária
 * - Precificação de Rotas: Frete do Cliente, Gestão Logística (embutida), Desconto de Rota, Sugerido vs Final (Override com Motivo)
 * - Preservação de Snapshots
 * - Privacidade Estrita do Motorista
 * - Integração com M4.1 Pagamentos
 */

import { db, initDbConstraints } from '../src/db/index.ts';
import {
  drivers,
  routes,
  routeStops,
  routeEvents,
  routeOfferDispatches,
  deliveryModalities,
  neighborhoods,
  deliveryConfigurations,
  freightPrices,
} from '../src/db/schema.ts';
import { routeService } from '../src/server/routeService.ts';
import { driverService } from '../src/server/driverService.ts';
import { referralService } from '../src/server/referralService.ts';
import { deliveryConfigService } from '../src/server/deliveryConfigService.ts';
import { telegramBot } from '../src/server/telegramBot.ts';
import { eq, and } from 'drizzle-orm';
import { normalizeNeighborhoodName, mapVehicleTypeToPricingCategory } from '../src/server/types.ts';

async function runM42Suite() {
  console.log('🚀 INICIANDO SUÍTE DE TESTES M4.2 — MODALIDADES, TABELA DE FRETES E PRECIFICAÇÃO\n');
  await initDbConstraints();

  const timestamp = Date.now();

  telegramBot.setDriverService(driverService);
  telegramBot.setReferralService(referralService);
  telegramBot.setRouteService(routeService);

  // =========================================================================
  // PARTE B & D: MODALIDADES, BAIRROS E NORMALIZAÇÃO
  // =========================================================================
  console.log('=========================================================================');
  console.log('PARTE B & D: MODALIDADES, BAIRROS E NORMALIZAÇÃO');
  console.log('=========================================================================');

  // Modalidades iniciais
  const modalities = await deliveryConfigService.getModalities();
  console.log(`✅ Modalidades cadastradas no banco: ${modalities.map((m) => m.code).join(', ')}`);
  if (!modalities.some((m) => m.code === 'BOLO') || !modalities.some((m) => m.code === 'CESTA') || !modalities.some((m) => m.code === 'CONVENCIONAL')) {
    throw new Error('❌ Modalidades padrão (BOLO, CESTA, CONVENCIONAL) não encontradas!');
  }

  // Normalização de bairros
  const testNorm1 = normalizeNeighborhoodName('Santa Mônica');
  const testNorm2 = normalizeNeighborhoodName('SANTA MONICA');
  const testNorm3 = normalizeNeighborhoodName('  Santa Monica  ');
  if (testNorm1 !== 'santa monica' || testNorm2 !== 'santa monica' || testNorm3 !== 'santa monica') {
    throw new Error(`❌ Falha na normalização de bairros: "${testNorm1}", "${testNorm2}", "${testNorm3}"`);
  }
  console.log(`✅ Normalização de bairros validada: "Santa Mônica" = "${testNorm1}"`);

  // Cadastrar ou recuperar Bairro Centro e Santa Mônica
  const bCentro = await deliveryConfigService.findOrCreateNeighborhood('Centro');
  const bSantaMonica = await deliveryConfigService.findOrCreateNeighborhood('Santa Mônica');
  console.log(`✅ Bairros garantidos: #${bCentro.id} (${bCentro.name}), #${bSantaMonica.id} (${bSantaMonica.name})`);

  // =========================================================================
  // PARTE C & E: TABELA DE FRETES (MATRIZ TARIFÁRIA)
  // PRICE-T01, PRICE-T02, PRICE-T03
  // =========================================================================
  console.log('\n=========================================================================');
  console.log('PARTE C & E: MATRIZ TARIFÁRIA (PRICE-T01, PRICE-T02, PRICE-T03)');
  console.log('=========================================================================');

  // PRICE-T01: Centro x BOLO x CARRO x R$ 27,50
  const priceT01 = await deliveryConfigService.upsertFreightPrice({
    neighborhood_id: bCentro.id,
    modality_code: 'BOLO',
    vehicle_category: 'CAR',
    price: 27.50,
  });
  console.log(`✅ PRICE-T01: Persistência real: Centro x BOLO x CAR = R$ ${priceT01.price.toFixed(2)}`);

  // PRICE-T02: Mesma modalidade/bairro para MOTO (R$ 18,00)
  const priceT02 = await deliveryConfigService.upsertFreightPrice({
    neighborhood_id: bCentro.id,
    modality_code: 'BOLO',
    vehicle_category: 'MOTO',
    price: 18.00,
  });
  console.log(`✅ PRICE-T02: Preço independente para MOTO: Centro x BOLO x MOTO = R$ ${priceT02.price.toFixed(2)}`);

  // PRICE-T03: MOTO COM BAG (R$ 22,00)
  const priceT03 = await deliveryConfigService.upsertFreightPrice({
    neighborhood_id: bCentro.id,
    modality_code: 'BOLO',
    vehicle_category: 'MOTO_WITH_BAG',
    price: 22.00,
  });
  console.log(`✅ PRICE-T03: Categoria independente: Centro x BOLO x MOTO_WITH_BAG = R$ ${priceT03.price.toFixed(2)}`);

  // Preço para Santa Mônica x BOLO x CAR (R$ 38,50)
  await deliveryConfigService.upsertFreightPrice({
    neighborhood_id: bSantaMonica.id,
    modality_code: 'BOLO',
    vehicle_category: 'CAR',
    price: 38.50,
  });

  // PRICE-T05: Sugestão de valor tabelado
  const sugCentroBoloCar = await deliveryConfigService.getSuggestedFreightPrice(bCentro.id, 'BOLO', 'CAR');
  if (sugCentroBoloCar.price !== 27.50 || sugCentroBoloCar.source !== 'TABLE') {
    throw new Error(`❌ PRICE-T05: Esperado R$ 27,50 de TABLE, obteve ${sugCentroBoloCar.price}`);
  }
  console.log('✅ PRICE-T05: Sugestão/prefill obtida com sucesso da matriz tarifária.');

  // =========================================================================
  // PARTE G: FÓRMULA DE GESTÃO LOGÍSTICA
  // PRICE-T07
  // =========================================================================
  console.log('\n=========================================================================');
  console.log('PARTE G: FÓRMULA DE GESTÃO LOGÍSTICA EMBUTIDA (PRICE-T07)');
  console.log('=========================================================================');

  // PRICE-T07: Gestão 10%, customer_freight = 55. Esperado: base = 50, management = 5.
  const calcT07 = deliveryConfigService.calculateRoutePricing([{ customer_freight: 55 }], {
    logistics_management_rate: 0.10,
    default_route_discount_percent: 0.20,
  });

  const stop1T07 = calcT07.stopsBreakdown[0];
  if (stop1T07.net_delivery_base !== 50 || stop1T07.management_amount !== 5) {
    throw new Error(`❌ PRICE-T07: Esperado base=50 e mgmt=5, obteve base=${stop1T07.net_delivery_base} mgmt=${stop1T07.management_amount}`);
  }
  console.log(`✅ PRICE-T07: customer_freight=55, gestão=10% -> base=${stop1T07.net_delivery_base}, gestão=${stop1T07.management_amount} (exata sem bitributação)`);

  // =========================================================================
  // PARTE H: CÁLCULO DA ROTA & DESCONTO DE AGRUPAMENTO
  // PRICE-T08, PRICE-T09
  // =========================================================================
  console.log('\n=========================================================================');
  console.log('PARTE H: CÁLCULO DE ROTA & OVERRIDE COM MOTIVO (PRICE-T08, PRICE-T09)');
  console.log('=========================================================================');

  // PRICE-T08: Bases 25 + 35 = 60, route_discount = 20% -> suggested_driver_fee = 48.
  // Note: para obter base 25 com 10%: customer_freight = 25 * 1.10 = 27.50
  //       para obter base 35 com 10%: customer_freight = 35 * 1.10 = 38.50
  const calcT08 = deliveryConfigService.calculateRoutePricing(
    [{ customer_freight: 27.50 }, { customer_freight: 38.50 }],
    { logistics_management_rate: 0.10, default_route_discount_percent: 0.20 }
  );

  if (calcT08.route_base_amount !== 60) {
    throw new Error(`❌ PRICE-T08: route_base_amount esperado 60, obteve ${calcT08.route_base_amount}`);
  }
  if (calcT08.suggested_driver_fee !== 48) {
    throw new Error(`❌ PRICE-T08: suggested_driver_fee esperado 48, obteve ${calcT08.suggested_driver_fee}`);
  }
  console.log(`✅ PRICE-T08: Bases: 25 + 35 = 60, desconto 20% -> suggested_driver_fee = R$ ${calcT08.suggested_driver_fee.toFixed(2)}`);

  // PRICE-T09: Override 48 -> 50. Motivo obrigatório.
  // Testando rejeição sem motivo:
  try {
    await routeService.createDraft({
      pickup_type: 'AD_HOC',
      pickup_name: 'Kantine Matriz',
      pickup_address: 'Rua Afonso Pena, 500',
      final_deadline: '19:30',
      total_fee: '50,00',
      accepted_vehicle_types: ['CAR_HATCH', 'CAR_SEDAN'],
      stops: [
        {
          destination_address: 'Rua A, 100',
          destination_neighborhood: 'Centro',
          cargo_description: 'Bolo 1',
          customer_freight: 27.50,
          modality_code: 'BOLO',
        },
        {
          destination_address: 'Rua B, 200',
          destination_neighborhood: 'Santa Mônica',
          cargo_description: 'Bolo 2',
          customer_freight: 38.50,
          modality_code: 'BOLO',
        },
      ],
      suggested_driver_fee: 48.00,
      final_driver_fee: 50.00,
      // override_reason ausente intencionalmente
    });
    throw new Error('❌ Falha: Override sem motivo deveria ter sido rejeitado!');
  } catch (err: any) {
    if (err.message.includes('OVERRIDE_REASON_REQUIRED')) {
      console.log('✅ Tentativa de override sem motivo estritamente rejeitada.');
    } else {
      throw err;
    }
  }

  // Criação com override válido e motivo
  const routeT09 = await routeService.createDraft({
    pickup_type: 'AD_HOC',
    pickup_name: 'Kantine Matriz',
    pickup_address: 'Rua Afonso Pena, 500',
    pickup_neighborhood: 'Centro',
    final_deadline: '19:30',
    total_fee: '50,00',
    accepted_vehicle_types: ['CAR_HATCH', 'CAR_SEDAN'],
    stops: [
      {
        destination_address: 'Rua A, 100',
        destination_neighborhood: 'Centro',
        cargo_description: 'Bolo 1',
        customer_freight: 27.50,
        modality_code: 'BOLO',
      },
      {
        destination_address: 'Rua B, 200',
        destination_neighborhood: 'Santa Mônica',
        cargo_description: 'Bolo 2',
        customer_freight: 38.50,
        modality_code: 'BOLO',
      },
    ],
    suggested_driver_fee: 48.00,
    final_driver_fee: 50.00,
    override_reason: 'Ajuste operacional de rota em horário de pico',
  });

  if (routeT09.suggested_driver_fee !== 48 || routeT09.final_driver_fee !== 50) {
    throw new Error(`❌ Divergência de valores: suggested=${routeT09.suggested_driver_fee}, final=${routeT09.final_driver_fee}`);
  }
  if (!routeT09.override_reason?.includes('horário de pico')) {
    throw new Error('❌ Motivo do override não persistido!');
  }
  console.log(`✅ PRICE-T09: Override validado: sugerido=R$ 48, final=R$ 50, motivo="${routeT09.override_reason}"`);

  // =========================================================================
  // PARTE I: ROTA MISTURANDO MODALIDADES (PRICE-T04)
  // =========================================================================
  console.log('\n=========================================================================');
  console.log('PARTE I: ROTA MISTURANDO MODALIDADES POR PARADA (PRICE-T04)');
  console.log('=========================================================================');

  const mixedRoute = await routeService.createDraft({
    pickup_type: 'AD_HOC',
    pickup_name: 'Kantine Matriz',
    pickup_address: 'Rua Afonso Pena, 500',
    pickup_neighborhood: 'Centro',
    final_deadline: '20:00',
    total_fee: '65,00',
    override_reason: 'Ajuste de teste para rota mista',
    accepted_vehicle_types: ['CAR_HATCH', 'CAR_SEDAN', 'CAR_SW'],
    stops: [
      {
        destination_address: 'Av. Floriano, 10',
        destination_neighborhood: 'Centro',
        cargo_description: 'Bolo Casamento',
        modality_code: 'BOLO',
        customer_freight: 30.00,
      },
      {
        destination_address: 'Av. Afonso Pena, 20',
        destination_neighborhood: 'Centro',
        cargo_description: 'Cesta Café da Manhã',
        modality_code: 'CESTA',
        customer_freight: 35.00,
      },
      {
        destination_address: 'Rua Olegário, 30',
        destination_neighborhood: 'Martins',
        cargo_description: 'Caixa de Docinhos',
        modality_code: 'CONVENCIONAL',
        customer_freight: 20.00,
      },
    ],
  });

  if (mixedRoute.stops?.length !== 3) {
    throw new Error('❌ Rota mista deveria conter 3 paradas');
  }
  const stopModalities = mixedRoute.stops.map((s) => s.modality_code);
  if (stopModalities[0] !== 'BOLO' || stopModalities[1] !== 'CESTA' || stopModalities[2] !== 'CONVENCIONAL') {
    throw new Error(`❌ Modalidades divergentes nas paradas: ${stopModalities.join(', ')}`);
  }
  console.log(`✅ PRICE-T04: Rota criada misturando modalidades com sucesso: [${stopModalities.join(' | ')}]`);

  // =========================================================================
  // PARTE P & J: PRIVACIDADE DO MOTORISTA & PUBLICAÇÃO (PRICE-T10)
  // =========================================================================
  console.log('\n=========================================================================');
  console.log('PARTE P & J: PRIVACIDADE DO MOTORISTA & PUBLICAÇÃO (PRICE-T10)');
  console.log('=========================================================================');

  // Criar motorista ativo de teste para receber rota
  const [testDriver] = await db
    .insert(drivers)
    .values({
      telegram_user_id: `tg_m42_${timestamp}`,
      telegram_chat_id: `chat_m42_${timestamp}`,
      name: 'Motorista M4.2 Teste',
      phone: '34998887777',
      vehicle_type: 'CAR_HATCH',
      pix_key_type: 'CPF',
      pix_key_value: '99988877766',
      status: 'ACTIVE',
    })
    .returning();

  // Publicar rota routeT09 (onde suggested=48 e final=50)
  const publishRes = await routeService.publishRoute(routeT09.id, 'admin@kantine.com');
  console.log(`✅ Rota #${routeT09.id} publicada como OFFERED.`);

  // Verificar mensagem no Telegram: valor exibido deve ser R$ 50,00 (final_driver_fee)
  // E auditar payload sanitizado para motorista
  const driverSafeView = routeService.sanitizeRouteForDriver(publishRes.route);

  // Verificações negativas obrigatórias (Seção 41)
  if ((driverSafeView as any).customer_freight_total !== undefined) {
    throw new Error('❌ VAZAMENTO DE PRIVACIDADE: customer_freight_total exposto ao motorista!');
  }
  if ((driverSafeView as any).management_rate_snapshot !== undefined) {
    throw new Error('❌ VAZAMENTO DE PRIVACIDADE: management_rate_snapshot exposto ao motorista!');
  }
  if ((driverSafeView as any).management_amount_total !== undefined) {
    throw new Error('❌ VAZAMENTO DE PRIVACIDADE: management_amount_total exposto ao motorista!');
  }
  if ((driverSafeView as any).route_base_amount !== undefined) {
    throw new Error('❌ VAZAMENTO DE PRIVACIDADE: route_base_amount exposto ao motorista!');
  }
  if ((driverSafeView as any).route_discount_percent_snapshot !== undefined) {
    throw new Error('❌ VAZAMENTO DE PRIVACIDADE: route_discount_percent_snapshot exposto ao motorista!');
  }
  if ((driverSafeView as any).suggested_driver_fee !== undefined) {
    throw new Error('❌ VAZAMENTO DE PRIVACIDADE: suggested_driver_fee exposto ao motorista!');
  }
  if ((driverSafeView as any).override_reason !== undefined) {
    throw new Error('❌ VAZAMENTO DE PRIVACIDADE: override_reason exposto ao motorista!');
  }

  for (const s of driverSafeView.stops || []) {
    if ((s as any).customer_freight !== undefined) {
      throw new Error(`❌ VAZAMENTO DE PRIVACIDADE: customer_freight exposto na parada #${s.sequence}!`);
    }
    if ((s as any).net_delivery_base !== undefined) {
      throw new Error(`❌ VAZAMENTO DE PRIVACIDADE: net_delivery_base exposto na parada #${s.sequence}!`);
    }
    if ((s as any).management_amount !== undefined) {
      throw new Error(`❌ VAZAMENTO DE PRIVACIDADE: management_amount exposto na parada #${s.sequence}!`);
    }
  }

  if (driverSafeView.total_fee !== '50,00') {
    throw new Error(`❌ O motorista deveria receber oferta de R$ 50,00, obteve ${driverSafeView.total_fee}`);
  }
  console.log('✅ PRICE-T10 & AUDITORIA DE PRIVACIDADE: Motorista vê apenas o frete final R$ 50,00. Zero vazamento de margens comerciais internas.');

  // =========================================================================
  // PARTE K: INTEGRAÇÃO COM MÓDULO DE PAGAMENTOS (PRICE-T11)
  // =========================================================================
  console.log('\n=========================================================================');
  console.log('PARTE K: INTEGRAÇÃO COM MÓDULO DE PAGAMENTOS (PRICE-T11)');
  console.log('=========================================================================');

  // Aceitar rota pelo motorista (garantir status SENT no dispatch para teste)
  await db
    .update(routeOfferDispatches)
    .set({ status: 'SENT' })
    .where(
      and(
        eq(routeOfferDispatches.route_id, routeT09.id),
        eq(routeOfferDispatches.driver_id, testDriver.id)
      )
    );

  const acceptRes = await routeService.acceptRoute(routeT09.id, { driverId: testDriver.id });
  if (acceptRes.status !== 'WON') {
    throw new Error(`❌ Aceite de rota falhou: ${acceptRes.status} (${acceptRes.error})`);
  }

  // Executar passos da rota até conclusão
  await routeService.markArrivedPickup(routeT09.id, { driverId: testDriver.id });
  await routeService.markPickedUp(routeT09.id, { driverId: testDriver.id });
  await routeService.startRoute(routeT09.id, { driverId: testDriver.id });

  // Entregar paradas
  const freshStops = await db.select().from(routeStops).where(eq(routeStops.route_id, routeT09.id));
  for (const s of freshStops) {
    await routeService.deliverStopWithPin(s.id, s.pin_code!, { driverId: testDriver.id });
  }

  const finishedRoute = await routeService.getRouteById(routeT09.id);
  if (finishedRoute?.status !== 'COMPLETED') {
    throw new Error('❌ Rota deveria estar COMPLETED');
  }

  // Verificar pagamento da rota: o repasse deve ser exatamente o final_driver_fee (R$ 50,00)
  const paid = await routeService.registerRoutePayment(routeT09.id, {
    paid_by: 'financeiro@kantine.com',
    payment_method: 'PIX',
    payment_reference: 'PIX-M42-TEST',
  });

  if (paid.total_fee !== '50,00') {
    throw new Error(`❌ Valor de pagamento deveria ser R$ 50,00, obteve ${paid.total_fee}`);
  }
  console.log(`✅ PRICE-T11: Módulo de pagamento utilizou o valor final do motorista (R$ ${paid.total_fee}), não a base ou o sugerido.`);

  // =========================================================================
  // PARTE L: IMUTABILIDADE & PRESERVAÇÃO DE SNAPSHOTS
  // PRICE-T12, PRICE-T13
  // =========================================================================
  console.log('\n=========================================================================');
  console.log('PARTE L: IMUTABILIDADE & PRESERVAÇÃO DE SNAPSHOTS (PRICE-T12, PRICE-T13)');
  console.log('=========================================================================');

  // PRICE-T12: Alterar gestão global para 12%
  await deliveryConfigService.updateDeliveryConfig('LOGISTICS_MANAGEMENT_RATE', '0.12');
  const updatedConfig = await deliveryConfigService.getDeliveryConfig();
  if (updatedConfig.logistics_management_rate !== 0.12) {
    throw new Error('❌ Falha ao atualizar taxa global para 12%');
  }
  console.log('Taxa global atualizada para 12%.');

  // Verificar que a rota histórica permanece com snapshot de 10% (0.1000)
  const historicalRouteAfterRateChange = await routeService.getRouteById(routeT09.id);
  if (historicalRouteAfterRateChange?.management_rate_snapshot !== 0.1) {
    throw new Error(`❌ PRICE-T12: Rota histórica teve snapshot alterado: ${historicalRouteAfterRateChange?.management_rate_snapshot}`);
  }
  console.log(`✅ PRICE-T12: Rota histórica preservou snapshot de 10% (${historicalRouteAfterRateChange?.management_rate_snapshot}) intacto.`);

  // PRICE-T13: Alterar tabela de bairro Centro x BOLO x CARRO para R$ 99,00
  await deliveryConfigService.upsertFreightPrice({
    neighborhood_id: bCentro.id,
    modality_code: 'BOLO',
    vehicle_category: 'CAR',
    price: 99.00,
  });
  console.log('Preço de Centro x BOLO x CAR alterado para R$ 99,00 na matriz.');

  // Verificar que as paradas e a rota histórica não foram alteradas
  const historicalRouteAfterPriceChange = await routeService.getRouteById(routeT09.id);
  if (historicalRouteAfterPriceChange?.final_driver_fee !== 50 || historicalRouteAfterPriceChange?.total_fee !== '50,00') {
    throw new Error('❌ PRICE-T13: Rota histórica teve valor alterado após mudança na matriz!');
  }
  const stop1After = historicalRouteAfterPriceChange?.stops?.find((s) => s.sequence === 1);
  if (stop1After?.customer_freight !== 27.50) {
    throw new Error(`❌ PRICE-T13: Parada histórica teve frete alterado: ${stop1After?.customer_freight}`);
  }
  console.log(`✅ PRICE-T13: Rota e paradas históricas permaneceram inalteradas (Frete Parada #1 = R$ ${stop1After?.customer_freight.toFixed(2)}).`);

  // Restaurar taxa global para 10%
  await deliveryConfigService.updateDeliveryConfig('LOGISTICS_MANAGEMENT_RATE', '0.10');

  console.log('\n=========================================================================');
  console.log('🎉 TODOS OS TESTES DA SUÍTE M4.2 PASSARAM COM 100% DE SUCESSO DETERMINÍSTICO!');
  console.log('=========================================================================');
  process.exit(0);
}

runM42Suite().catch((err) => {
  console.error('\n❌ ERRO NA EXECUÇÃO DA SUÍTE M4.2:', err);
  process.exit(1);
});
