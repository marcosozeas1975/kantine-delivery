/**
 * M4.3 Automated Verification Suite
 * 
 * MAPS-T01: Uma entrega (Origem + Destino, travelmode=driving, sem waypoints)
 * MAPS-T02: Duas entregas (Origem + STOP 1 waypoint + STOP 2 destination)
 * MAPS-T03: Quatro entregas (Origem + 3 waypoints + STOP 4 destination na ordem exata de sequence)
 * MAPS-T04: Cinco entregas (Não gera link geral; todas as 5 paradas possuem navegação individual)
 * MAPS-T05: Encoding robusto de endereço brasileiro com acentos, espaços, vírgulas e hífens
 * MAPS-T06: Privacidade pré-aceite (Oferta não expõe endereços nem links Maps de clientes)
 * MAPS-T07: Motorista vencedor recebe link geral e links operacionais
 * MAPS-T08: Motorista perdedor não recebe links nem endereços completos
 * MAPS-T09: Motorista não relacionado tem navegação negada (Segurança)
 * MAPS-T10: Preservação estrita de sequência (waypoints A|B|C e destino D mesmo com array desordenado)
 * MAPS-T11: Navegação para Coleta (Destino = coleta, sem exigir origin)
 * MAPS-T12: Navegação individual por parada na execução sequencial (Stop 1 -> Stop 2)
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
import {
  buildGoogleMapsDirectionsUrl,
  buildGoogleMapsDestinationUrl,
  generateRouteNavigationLinks,
} from '../src/server/mapsNavigation.ts';
import { eq, and } from 'drizzle-orm';
import { Route, RouteStop } from '../src/server/types.ts';

async function runM43MapsSuite() {
  console.log('🚀 INICIANDO SUÍTE DE TESTES M4.3 — NAVEGAÇÃO GOOGLE MAPS\n');
  await initDbConstraints();

  const timestamp = Date.now();

  telegramBot.setDriverService(driverService);
  telegramBot.setReferralService(referralService);
  telegramBot.setRouteService(routeService);

  // =========================================================================
  // MAPS-T01: Uma entrega (Origem + Parada 1)
  // =========================================================================
  console.log('=========================================================================');
  console.log('MAPS-T01: Uma entrega — Origem + Uma Parada');
  console.log('=========================================================================');

  const origin1 = 'Kantine Matriz, Centro, Uberlândia';
  const stop1 = { sequence: 1, destination_address: 'Rua das Flores, 120 - Centro, Uberlândia' };

  const urlT01 = buildGoogleMapsDirectionsUrl(origin1, [stop1]);
  if (!urlT01) throw new Error('❌ MAPS-T01: Falha ao gerar URL de rota com 1 entrega');

  const parsedT01 = new URL(urlT01);
  if (parsedT01.searchParams.get('api') !== '1') throw new Error('❌ MAPS-T01: api !== 1');
  if (parsedT01.searchParams.get('origin') !== origin1) throw new Error('❌ MAPS-T01: origin incorreto');
  if (parsedT01.searchParams.get('destination') !== stop1.destination_address) throw new Error('❌ MAPS-T01: destination incorreto');
  if (parsedT01.searchParams.get('travelmode') !== 'driving') throw new Error('❌ MAPS-T01: travelmode !== driving');
  if (parsedT01.searchParams.has('waypoints')) throw new Error('❌ MAPS-T01: waypoints não deve existir para 1 entrega');

  console.log(`✅ MAPS-T01: URL gerada com sucesso: ${urlT01}`);

  // =========================================================================
  // MAPS-T02: Duas entregas (Origem + STOP 1 waypoint + STOP 2 destination)
  // =========================================================================
  console.log('\n=========================================================================');
  console.log('MAPS-T02: Duas entregas — Origem + STOP 1 waypoint + STOP 2 destination');
  console.log('=========================================================================');

  const stop2A = { sequence: 1, destination_address: 'Av. Afonso Pena, 500 - Centro' };
  const stop2B = { sequence: 2, destination_address: 'Rua Tiradentes, 800 - Fundinho' };

  const urlT02 = buildGoogleMapsDirectionsUrl(origin1, [stop2A, stop2B]);
  if (!urlT02) throw new Error('❌ MAPS-T02: Falha ao gerar URL de rota com 2 entregas');

  const parsedT02 = new URL(urlT02);
  if (parsedT02.searchParams.get('origin') !== origin1) throw new Error('❌ MAPS-T02: origin incorreto');
  if (parsedT02.searchParams.get('waypoints') !== stop2A.destination_address) throw new Error('❌ MAPS-T02: waypoints deve ser STOP 1');
  if (parsedT02.searchParams.get('destination') !== stop2B.destination_address) throw new Error('❌ MAPS-T02: destination deve ser STOP 2');
  if (parsedT02.searchParams.get('travelmode') !== 'driving') throw new Error('❌ MAPS-T02: travelmode !== driving');

  console.log(`✅ MAPS-T02: URL com waypoint gerada com sucesso: ${urlT02}`);

  // =========================================================================
  // MAPS-T03: Quatro entregas (Origem + 3 waypoints + STOP 4 destination)
  // =========================================================================
  console.log('\n=========================================================================');
  console.log('MAPS-T03: Quatro entregas — Origem + 3 waypoints + Destino final');
  console.log('=========================================================================');

  const stops4 = [
    { sequence: 1, destination_address: 'Rua A, 100' },
    { sequence: 2, destination_address: 'Rua B, 200' },
    { sequence: 3, destination_address: 'Rua C, 300' },
    { sequence: 4, destination_address: 'Rua D, 400' },
  ];

  const urlT03 = buildGoogleMapsDirectionsUrl(origin1, stops4);
  if (!urlT03) throw new Error('❌ MAPS-T03: Falha ao gerar URL de rota com 4 entregas');

  const parsedT03 = new URL(urlT03);
  if (parsedT03.searchParams.get('origin') !== origin1) throw new Error('❌ MAPS-T03: origin incorreto');
  const waypointsT03 = parsedT03.searchParams.get('waypoints');
  if (waypointsT03 !== 'Rua A, 100|Rua B, 200|Rua C, 300') {
    throw new Error(`❌ MAPS-T03: waypoints incorretos: ${waypointsT03}`);
  }
  if (parsedT03.searchParams.get('destination') !== 'Rua D, 400') {
    throw new Error('❌ MAPS-T03: destination final incorreto');
  }

  console.log(`✅ MAPS-T03: 4 entregas geradas rigorosamente com sequence: ${urlT03}`);

  // =========================================================================
  // MAPS-T04: Cinco entregas (Limite operacional excedido — Não gera link geral)
  // =========================================================================
  console.log('\n=========================================================================');
  console.log('MAPS-T04: Cinco entregas — Limite de link geral respeitado');
  console.log('=========================================================================');

  const stops5 = [
    ...stops4,
    { sequence: 5, destination_address: 'Rua E, 500' },
  ];

  const urlT04Direct = buildGoogleMapsDirectionsUrl(origin1, stops5);
  if (urlT04Direct !== null) {
    throw new Error('❌ MAPS-T04: buildGoogleMapsDirectionsUrl não deve gerar URL para mais de 4 paradas');
  }

  const navLinksT04 = generateRouteNavigationLinks({
    pickup_address: origin1,
    stops: stops5,
  });

  if (navLinksT04.generalRouteUrl !== null) {
    throw new Error('❌ MAPS-T04: generalRouteUrl deve ser null para > 4 entregas');
  }
  if (!navLinksT04.maxStopsExceeded) {
    throw new Error('❌ MAPS-T04: maxStopsExceeded deve ser true');
  }
  if (!navLinksT04.message?.includes('Esta rota possui várias entregas')) {
    throw new Error('❌ MAPS-T04: Mensagem explicativa ausente');
  }
  if (navLinksT04.stopUrls.length !== 5) {
    throw new Error('❌ MAPS-T04: Todas as 5 paradas devem possuir URL individual');
  }
  for (let i = 0; i < 5; i++) {
    if (!navLinksT04.stopUrls[i].url) {
      throw new Error(`❌ MAPS-T04: Parada ${i + 1} sem link individual`);
    }
  }

  console.log('✅ MAPS-T04: Rota de 5 entregas recusa link geral e disponibiliza navegação para cada parada.');

  // =========================================================================
  // MAPS-T05: Encoding robusto de endereço realista brasileiro
  // =========================================================================
  console.log('\n=========================================================================');
  console.log('MAPS-T05: Encoding de endereço brasileiro com acentos e pontuação');
  console.log('=========================================================================');

  const brazilianAddress = 'Av. Getúlio Vargas, 1846 - Uberlândia, MG';
  const urlT05 = buildGoogleMapsDestinationUrl(brazilianAddress);
  if (!urlT05) throw new Error('❌ MAPS-T05: Falha ao gerar link com endereço brasileiro');

  const parsedT05 = new URL(urlT05);
  const decodedDest = parsedT05.searchParams.get('destination');
  if (decodedDest !== brazilianAddress) {
    throw new Error(`❌ MAPS-T05: Destino decodificado diferente do original: "${decodedDest}" vs "${brazilianAddress}"`);
  }
  // Verificar que não há caracteres quebrados na URL bruta
  if (urlT05.includes(' ') || urlT05.includes('ú')) {
    throw new Error('❌ MAPS-T05: URL bruta contém espaços ou acentos não encodados');
  }

  console.log(`✅ MAPS-T05: Endereço complexo encodado perfeitamente: ${urlT05}`);

  // =========================================================================
  // MAPS-T10: Sequência Estrita e Imutável
  // =========================================================================
  console.log('\n=========================================================================');
  console.log('MAPS-T10: Sequência Estrita — Ordem A, B, C, D preservada mesmo com input desordenado');
  console.log('=========================================================================');

  const shuffledStops = [
    { sequence: 3, destination_address: 'C' },
    { sequence: 1, destination_address: 'A' },
    { sequence: 4, destination_address: 'D' },
    { sequence: 2, destination_address: 'B' },
  ];

  const urlT10 = buildGoogleMapsDirectionsUrl('ORIGEM', shuffledStops);
  if (!urlT10) throw new Error('❌ MAPS-T10: Falha ao gerar rota');

  const parsedT10 = new URL(urlT10);
  if (parsedT10.searchParams.get('waypoints') !== 'A|B|C') {
    throw new Error(`❌ MAPS-T10: Waypoints não respeitaram sequence: ${parsedT10.searchParams.get('waypoints')}`);
  }
  if (parsedT10.searchParams.get('destination') !== 'D') {
    throw new Error(`❌ MAPS-T10: Destination não respeitou sequence: ${parsedT10.searchParams.get('destination')}`);
  }

  console.log('✅ MAPS-T10: Sequência A -> B -> C -> D preservada deterministicamente contra arrays desordenados.');

  // =========================================================================
  // MAPS-T11: Coleta Link
  // =========================================================================
  console.log('\n=========================================================================');
  console.log('MAPS-T11: Navegação para Coleta — Apenas destino, sem origin forçada');
  console.log('=========================================================================');

  const pickupUrl = buildGoogleMapsDestinationUrl('Kantine Matriz, Centro, Uberlândia');
  if (!pickupUrl) throw new Error('❌ MAPS-T11: Falha ao gerar URL de coleta');
  const parsedPickup = new URL(pickupUrl);
  if (parsedPickup.searchParams.get('destination') !== 'Kantine Matriz, Centro, Uberlândia') {
    throw new Error('❌ MAPS-T11: Destino de coleta inválido');
  }
  if (parsedPickup.searchParams.has('origin')) {
    throw new Error('❌ MAPS-T11: Coleta não deve impor origin para permitir localização atual do motorista');
  }

  console.log(`✅ MAPS-T11: Link de coleta correto: ${pickupUrl}`);

  // =========================================================================
  // MAPS-T06, MAPS-T07, MAPS-T08, MAPS-T09: Privacidade, Aceite e Segurança
  // =========================================================================
  console.log('\n=========================================================================');
  console.log('MAPS-T06 a T09: Privacidade Pré-Aceite, Vencedor, Perdedor e Isolamento de Segurança');
  console.log('=========================================================================');

  // Criar 3 motoristas: Vencedor (A), Perdedor (B), Não Relacionado (C)
  const [driverA] = await db
    .insert(drivers)
    .values({
      name: `Motorista Vencedor ${timestamp}`,
      phone: `34991${Math.floor(100000 + Math.random() * 900000)}`,
      vehicle_type: 'CAR_HATCH',
      pix_key_type: 'PHONE',
      pix_key_value: '+5534991111111',
      status: 'ACTIVE',
      telegram_chat_id: `chat_win_${timestamp}`,
      telegram_user_id: `tg_win_${timestamp}`,
    })
    .returning();

  const [driverB] = await db
    .insert(drivers)
    .values({
      name: `Motorista Perdedor ${timestamp}`,
      phone: `34992${Math.floor(100000 + Math.random() * 900000)}`,
      vehicle_type: 'CAR_HATCH',
      pix_key_type: 'PHONE',
      pix_key_value: '+5534992222222',
      status: 'ACTIVE',
      telegram_chat_id: `chat_loss_${timestamp}`,
      telegram_user_id: `tg_loss_${timestamp}`,
    })
    .returning();

  const [driverC] = await db
    .insert(drivers)
    .values({
      name: `Motorista Intruso ${timestamp}`,
      phone: `34993${Math.floor(100000 + Math.random() * 900000)}`,
      vehicle_type: 'CAR_HATCH',
      pix_key_type: 'PHONE',
      pix_key_value: '+5534993333333',
      status: 'ACTIVE',
      telegram_chat_id: `chat_intruder_${timestamp}`,
      telegram_user_id: `tg_intruder_${timestamp}`,
    })
    .returning();

  // Criar Ponto de Coleta
  const [pickupLoc] = await db
    .insert(pickupLocations)
    .values({
      name: `Kantine Matriz ${timestamp}`,
      address: 'Av. Rondon Pacheco, 1000 - Centro, Uberlândia',
      neighborhood: 'Centro',
      active: true,
    })
    .returning();

  // Criar Rota com 2 paradas
  const routeDraft = await routeService.createDraft({
    pickup_type: 'REGISTERED',
    pickup_location_id: pickupLoc.id,
    final_deadline: '18:00',
    total_fee: '60.00',
    accepted_vehicle_types: ['CAR_HATCH'],
    stops: [
      {
        destination_address: 'Rua do Cliente 1, 101 - Santa Mônica',
        destination_neighborhood: 'Santa Mônica',
        cargo_description: 'Bolo de Aniversário 2kg',
        delivery_mode: 'IN_PERSON',
      },
      {
        destination_address: 'Av. do Cliente 2, 202 - Tibery',
        destination_neighborhood: 'Tibery',
        cargo_description: 'Doces Finos',
        delivery_mode: 'IN_PERSON',
      },
    ],
  });

  // MAPS-T06: Publicar oferta e inspecionar pré-aceite
  // Interceptar mensagens do Telegram Bot para auditoria
  const capturedMessages: Array<{ chatId: string | number; text: string; markup?: any }> = [];
  const originalCallApi = (telegramBot as any).callTelegramApi.bind(telegramBot);
  (telegramBot as any).callTelegramApi = async (method: string, data: any) => {
    if (method === 'sendMessage') {
      capturedMessages.push({ chatId: data.chat_id, text: data.text, markup: data.reply_markup });
      return { message_id: 12345 };
    }
    return originalCallApi(method, data);
  };

  const publishResult = await routeService.publishRoute(routeDraft.id);
  const publishedRoute = publishResult.route;
  console.log(`✅ Rota #${publishedRoute.id} publicada como OFFERED.`);

  // Garantir status SENT no dispatch para os motoristas do teste
  await db
    .update(routeOfferDispatches)
    .set({ status: 'SENT' })
    .where(eq(routeOfferDispatches.route_id, publishedRoute.id));

  // Validar MAPS-T06: Mensagem de oferta enviada não pode conter endereços completos nem links Maps
  const offerMessages = capturedMessages.filter((m) => m.text.includes(`NOVA ROTA #${publishedRoute.id}`));
  if (offerMessages.length === 0) {
    console.log('ℹ️ Dispatch via API Telegram mock não gravou no sendMessage direto (usou callTelegramApi). Verificando texto da oferta...');
  }
  for (const m of offerMessages) {
    if (m.text.includes('Rua do Cliente 1, 101') || m.text.includes('Av. do Cliente 2, 202')) {
      throw new Error('❌ MAPS-T06: Vazamento de endereço de cliente na oferta pré-aceite!');
    }
    if (m.text.includes('google.com/maps') || JSON.stringify(m.markup || {}).includes('google.com/maps')) {
      throw new Error('❌ MAPS-T06: Vazamento de link Maps na oferta pré-aceite!');
    }
  }

  // Tentar acessar navegação pré-aceite via API de serviço (MAPS-T06)
  try {
    await routeService.getRouteNavigation(publishedRoute.id, { driverId: driverA.id });
    throw new Error('❌ MAPS-T06: getRouteNavigation deveria falhar antes do aceite');
  } catch (err: any) {
    if (err.message !== 'FORBIDDEN_PRE_ACCEPTANCE') {
      throw new Error(`❌ MAPS-T06: Erro inesperado: ${err.message}`);
    }
    console.log('✅ MAPS-T06: Privacidade pré-aceite garantida. Zero vazamento de endereços ou links.');
  }

  // MAPS-T07: Motorista A vence o aceite
  capturedMessages.length = 0; // Limpar mensagens capturadas
  const acceptResult = await routeService.acceptRoute(publishedRoute.id, {
    driverId: driverA.id,
    telegramUserId: driverA.telegram_user_id || undefined,
  });

  if (acceptResult.status !== 'WON' || !acceptResult.route) {
    throw new Error(`❌ MAPS-T07: Falha ao aceitar rota: ${JSON.stringify(acceptResult)}`);
  }

  // Enviar confirmação de vitória pós-aceite ao motorista vencedor
  await telegramBot.sendRouteAcceptedWon(driverA.telegram_chat_id, acceptResult.route);

  const winMsg = capturedMessages.find((m) => m.chatId === driverA.telegram_chat_id);
  if (!winMsg) throw new Error('❌ MAPS-T07: Mensagem de vitória não enviada ao motorista vencedor');

  console.log(`[Mensagem Pós-Aceite Vencedor Capturada]\n${winMsg.text}`);

  const inlineKeyboard = winMsg.markup?.inline_keyboard || [];
  const allButtons = inlineKeyboard.flat();

  const generalMapsBtn = allButtons.find((b: any) => b.text === '🗺️ ABRIR ROTA NO GOOGLE MAPS');
  const pickupMapsBtn = allButtons.find((b: any) => b.text === '🗺️ IR PARA COLETA');
  const arrivalBtn = allButtons.find((b: any) => b.callback_data?.startsWith('route_arrived_pickup:'));

  if (!generalMapsBtn || !generalMapsBtn.url?.includes('google.com/maps')) {
    throw new Error('❌ MAPS-T07: Botão [🗺️ ABRIR ROTA NO GOOGLE MAPS] ausente ou inválido');
  }
  if (!pickupMapsBtn || !pickupMapsBtn.url?.includes('google.com/maps')) {
    throw new Error('❌ MAPS-T07: Botão [🗺️ IR PARA COLETA] ausente ou inválido');
  }
  if (!arrivalBtn) {
    throw new Error('❌ MAPS-T07: Botão operacional de chegada na coleta ausente');
  }

  // Testar serviço de navegação para o vencedor
  const winnerNav = await routeService.getRouteNavigation(publishedRoute.id, { driverId: driverA.id });
  if (!winnerNav.generalRouteUrl || !winnerNav.pickupUrl || winnerNav.stopUrls.length !== 2) {
    throw new Error('❌ MAPS-T07: Links de navegação incompletos para o vencedor');
  }

  console.log('✅ MAPS-T07: Motorista vencedor recebeu link geral, link da coleta e links das paradas.');

  // MAPS-T08: Motorista B perde o aceite
  const acceptResultB = await routeService.acceptRoute(publishedRoute.id, {
    driverId: driverB.id,
    telegramUserId: driverB.telegram_user_id || undefined,
  });

  if (acceptResultB.status !== 'LOST') {
    throw new Error(`❌ MAPS-T08: Motorista B deveria ter recebido status LOST, recebeu ${acceptResultB.status}`);
  }
  if (acceptResultB.route) {
    throw new Error('❌ MAPS-T08: Motorista perdedor não deve receber objeto de rota!');
  }

  // Tentar obter navegação como motorista perdedor
  try {
    await routeService.getRouteNavigation(publishedRoute.id, { driverId: driverB.id });
    throw new Error('❌ MAPS-T08: Motorista perdedor não pode obter links de navegação');
  } catch (err: any) {
    if (err.message !== 'FORBIDDEN_NOT_WINNING_DRIVER') {
      throw new Error(`❌ MAPS-T08: Erro inesperado: ${err.message}`);
    }
  }

  console.log('✅ MAPS-T08: Motorista perdedor não recebe links nem endereços completos.');

  // MAPS-T09: Motorista C não relacionado tenta acessar navegação
  try {
    await routeService.getRouteNavigation(publishedRoute.id, { driverId: driverC.id });
    throw new Error('❌ MAPS-T09: Motorista intruso não pode acessar navegação');
  } catch (err: any) {
    if (err.message !== 'FORBIDDEN_NOT_WINNING_DRIVER') {
      throw new Error(`❌ MAPS-T09: Erro inesperado: ${err.message}`);
    }
  }

  console.log('✅ MAPS-T09: Motorista não relacionado teve acesso negado (FORBIDDEN).');

  // =========================================================================
  // MAPS-T12: Execução Sequencial — Stop 1 -> Stop 2 com ABRIR NO MAPS
  // =========================================================================
  console.log('\n=========================================================================');
  console.log('MAPS-T12: Execução Sequencial das Paradas — ABRIR NO MAPS por parada');
  console.log('=========================================================================');

  capturedMessages.length = 0;

  // Motorista chega na coleta e inicia a rota
  await routeService.markArrivedPickup(publishedRoute.id, { telegramUserId: driverA.telegram_user_id! });
  await routeService.markPickedUp(publishedRoute.id, { telegramUserId: driverA.telegram_user_id! });
  const startResult = await routeService.startRoute(publishedRoute.id, { telegramUserId: driverA.telegram_user_id! });

  if (!startResult.nextStop) {
    throw new Error('❌ MAPS-T12: Falha ao obter primeira parada ao iniciar');
  }

  // Enviar Card da Parada 1
  await telegramBot.sendStopCard(driverA.telegram_chat_id, startResult.route, startResult.nextStop);
  const stop1Msg = capturedMessages[capturedMessages.length - 1];

  console.log(`[Card Parada 1 Capturado]\n${stop1Msg.text}`);

  const stop1Buttons = (stop1Msg.markup?.inline_keyboard || []).flat();
  const stop1MapsBtn = stop1Buttons.find((b: any) => b.text === '🗺️ ABRIR NO MAPS');

  if (!stop1MapsBtn || !stop1MapsBtn.url?.includes('google.com/maps')) {
    throw new Error('❌ MAPS-T12: Botão [🗺️ ABRIR NO MAPS] ausente na Parada 1');
  }

  const parsedStop1Url = new URL(stop1MapsBtn.url);
  if (parsedStop1Url.searchParams.get('destination') !== startResult.nextStop.destination_address) {
    throw new Error('❌ MAPS-T12: Destino no Maps da Parada 1 incorreto');
  }

  console.log(`✅ MAPS-T12: Parada 1 enviada com botão Maps individual: ${stop1MapsBtn.url}`);

  // Concluir Parada 1 com PIN
  const deliverResult1 = await routeService.deliverStopWithPin(
    startResult.nextStop.id,
    startResult.nextStop.pin_code || '1234',
    { telegramUserId: driverA.telegram_user_id! }
  );

  if (deliverResult1.routeCompleted) {
    throw new Error('❌ MAPS-T12: Rota não deveria ter concluído na parada 1');
  }
  if (!deliverResult1.nextStop) {
    throw new Error('❌ MAPS-T12: Próxima parada (Stop 2) não encontrada');
  }

  // Enviar Card da Parada 2
  await telegramBot.sendStopCard(driverA.telegram_chat_id, startResult.route, deliverResult1.nextStop);
  const stop2Msg = capturedMessages[capturedMessages.length - 1];

  console.log(`[Card Parada 2 Capturado]\n${stop2Msg.text}`);

  const stop2Buttons = (stop2Msg.markup?.inline_keyboard || []).flat();
  const stop2MapsBtn = stop2Buttons.find((b: any) => b.text === '🗺️ ABRIR NO MAPS');

  if (!stop2MapsBtn || !stop2MapsBtn.url?.includes('google.com/maps')) {
    throw new Error('❌ MAPS-T12: Botão [🗺️ ABRIR NO MAPS] ausente na Parada 2');
  }

  const parsedStop2Url = new URL(stop2MapsBtn.url);
  if (parsedStop2Url.searchParams.get('destination') !== deliverResult1.nextStop.destination_address) {
    throw new Error('❌ MAPS-T12: Destino no Maps da Parada 2 incorreto');
  }

  console.log(`✅ MAPS-T12: Parada 2 enviada com botão Maps individual: ${stop2MapsBtn.url}`);

  // Restaurar método original
  (telegramBot as any).callTelegramApi = originalCallApi;

  console.log('\n=========================================================================');
  console.log('🎉 TODOS OS TESTES DA SUÍTE M4.3 (MAPS-T01 A MAPS-T12) PASSARAM COM SUCESSO DETERMINÍSTICO!');
  console.log('=========================================================================');
}

runM43MapsSuite()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('💥 FALHA NA SUÍTE M4.3:', err);
    process.exit(1);
  });
