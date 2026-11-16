import { db } from '../db/index.ts';
import { takeatConfigs, takeatOrders, routes } from '../db/schema.ts';
import { eq, and, desc, sql } from 'drizzle-orm';
import {
  calculateRoutePricing,
  UBERLANDIA_70_NEIGHBORHOODS,
  PICKUP_PRESETS,
  normalizeName,
  DEFAULT_FREIGHT_PARAMETERS,
  StopCalculationInput,
  GeoCoordinate,
} from './freightEngine.ts';
import { routeService } from './routeService.ts';
import { scheduleService } from './scheduleService.ts';

export interface TakeatConfigData {
  id: number;
  store_key: 'MATRIZ' | 'VINHEDOS';
  store_name: string;
  api_key: string | null;
  webhook_secret: string | null;
  store_id: string | null;
  default_pickup_preset: string;
  auto_calculate_freight: boolean;
  preferred_modality: 'MOTO' | 'CAR';
  notification_sound_enabled: boolean;
  is_active: boolean;
  last_webhook_received_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface TakeatOrderRecord {
  id: number;
  takeat_order_id: string;
  store_key: 'MATRIZ' | 'VINHEDOS';
  store_id: string | null;
  display_id: string;
  customer_name: string;
  customer_phone: string | null;
  destination_address: string;
  destination_neighborhood: string;
  destination_city: string;
  order_items_summary: string | null;
  order_items_json: any;
  order_total: string | null;
  delivery_fee_charged: string | null;
  payment_method: string | null;
  change_for: string | null;
  pickup_preset: string;
  status: 'PENDING_COURIER' | 'IN_ROUTE' | 'DELIVERED' | 'DISMISSED';
  calculated_freight_value: string | null;
  calculated_freight_details: any;
  created_route_id: number | null;
  raw_payload: any;
  /** Derivados do raw_payload (sem coluna no banco): CAR (bolos) | MOTO (demais). */
  vehicle_category?: 'MOTO' | 'CAR' | null;
  vehicle_reason?: string | null;
  created_at: Date;
  accepted_at: Date | null;
  dispatched_at: Date | null;
}

/**
 * Veículo do pedido, lido do payload recebido da ponte do Zelo (não depende de coluna nova no banco).
 */
export function vehicleOf(order: { raw_payload?: any }): { vehicle_category: 'MOTO' | 'CAR' | null; vehicle_reason: string | null } {
  const raw: any = order?.raw_payload || {};
  const p = raw?.data || raw?.order || raw;
  const v = String(p?.vehicle || '').toUpperCase();
  const vehicle_category = v === 'CAR' || v === 'MOTO' ? (v as 'MOTO' | 'CAR') : null;
  return { vehicle_category, vehicle_reason: vehicle_category ? String(p?.vehicleReason || '') || null : null };
}

const withVehicle = <T extends { raw_payload?: any }>(o: T): T => ({ ...o, ...vehicleOf(o) });

/**
 * Localização exata do endereço do cliente, como o Takeat guardou (latitude/longitude).
 * Com ela o frete é medido até a casa do cliente, igual ao Takeat — e não até o centro do bairro.
 * Só aceita coordenadas plausíveis da região de Uberlândia.
 */
export function dropoffCoordsOf(raw: any): GeoCoordinate | undefined {
  const p = raw?.data || raw?.order || raw || {};
  const d = p?.delivery || p?.endereco || p?.deliveryAddress || p?.address || {};
  const lat = Number(d?.latitude ?? d?.lat);
  const lng = Number(d?.longitude ?? d?.lng ?? d?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return undefined;
  if (lat < -19.6 || lat > -18.4 || lng < -48.9 || lng > -47.6) return undefined;
  return { lat, lng };
}

export class TakeatService {
  /**
   * Retorna todas as configurações de lojas cadastradas (Matriz e Vinhedos)
   */
  public async getAllConfigs(): Promise<{ MATRIZ: TakeatConfigData; VINHEDOS: TakeatConfigData }> {
    const rows = await db.select().from(takeatConfigs);
    
    let matriz = rows.find((r) => r.store_key === 'MATRIZ') as TakeatConfigData | undefined;
    let vinhedos = rows.find((r) => r.store_key === 'VINHEDOS') as TakeatConfigData | undefined;

    if (!matriz) {
      const [insertedMatriz] = await db
        .insert(takeatConfigs)
        .values({
          store_key: 'MATRIZ',
          store_name: 'Kantine Matriz',
          store_id: 'kantine-matriz',
          default_pickup_preset: 'MATRIZ',
          auto_calculate_freight: true,
          preferred_modality: 'MOTO',
          is_active: true,
        })
        .returning();
      matriz = insertedMatriz as TakeatConfigData;
    }

    if (!vinhedos) {
      const [insertedVinhedos] = await db
        .insert(takeatConfigs)
        .values({
          store_key: 'VINHEDOS',
          store_name: 'Kantine Vinhedos',
          store_id: 'kantine-vinhedos',
          default_pickup_preset: 'VINHEDOS',
          auto_calculate_freight: true,
          preferred_modality: 'MOTO',
          is_active: true,
        })
        .returning();
      vinhedos = insertedVinhedos as TakeatConfigData;
    }

    return {
      MATRIZ: matriz,
      VINHEDOS: vinhedos,
    };
  }

  /**
   * Retorna a configuração de uma loja específica (MATRIZ ou VINHEDOS)
   */
  public async getConfig(storeKey: 'MATRIZ' | 'VINHEDOS' = 'MATRIZ'): Promise<TakeatConfigData> {
    const all = await this.getAllConfigs();
    return all[storeKey] || all.MATRIZ;
  }

  /**
   * Salva configurações e chaves de API de uma loja específica (Matriz ou Vinhedos)
   */
  public async saveConfig(
    storeKey: 'MATRIZ' | 'VINHEDOS',
    data: {
      api_key?: string | null;
      webhook_secret?: string | null;
      store_id?: string | null;
      store_name?: string;
      default_pickup_preset?: string;
      auto_calculate_freight?: boolean;
      preferred_modality?: 'MOTO' | 'CAR';
      notification_sound_enabled?: boolean;
      is_active?: boolean;
    }
  ): Promise<TakeatConfigData> {
    const normalizedKey = (storeKey === 'VINHEDOS' ? 'VINHEDOS' : 'MATRIZ') as 'MATRIZ' | 'VINHEDOS';
    const current = await this.getConfig(normalizedKey);

    const updatePayload: any = {
      updated_at: new Date(),
    };

    if (data.api_key !== undefined) updatePayload.api_key = data.api_key ? data.api_key.trim() : null;
    if (data.webhook_secret !== undefined) updatePayload.webhook_secret = data.webhook_secret ? data.webhook_secret.trim() : null;
    if (data.store_id !== undefined) updatePayload.store_id = data.store_id ? data.store_id.trim() : null;
    if (data.store_name !== undefined) updatePayload.store_name = data.store_name ? data.store_name.trim() : current.store_name;
    if (data.default_pickup_preset !== undefined) updatePayload.default_pickup_preset = data.default_pickup_preset;
    if (data.auto_calculate_freight !== undefined) updatePayload.auto_calculate_freight = Boolean(data.auto_calculate_freight);
    if (data.preferred_modality !== undefined) updatePayload.preferred_modality = data.preferred_modality;
    if (data.notification_sound_enabled !== undefined) updatePayload.notification_sound_enabled = Boolean(data.notification_sound_enabled);
    if (data.is_active !== undefined) updatePayload.is_active = Boolean(data.is_active);

    const [updated] = await db
      .update(takeatConfigs)
      .set(updatePayload)
      .where(eq(takeatConfigs.id, current.id))
      .returning();

    return updated as TakeatConfigData;
  }

  /**
   * Identifica e normaliza o bairro de Uberlândia a partir do texto do Takeat
   */
  public matchUberlandiaNeighborhood(rawAddress: string, rawNeighborhood?: string): string {
    const candidates = [rawNeighborhood || '', rawAddress || ''];

    for (const text of candidates) {
      if (!text) continue;
      const normalized = normalizeName(text);

      // 1. Busca exata por nome de bairro
      for (const record of UBERLANDIA_70_NEIGHBORHOODS) {
        if (normalized === record.normalized || normalized.includes(record.normalized)) {
          return record.name;
        }
      }
    }

    // Se veio um bairro cru não vazio, retornar capitalizado
    if (rawNeighborhood && rawNeighborhood.trim()) {
      return rawNeighborhood.trim();
    }

    // Fallback: Centro
    return 'Centro';
  }

  /**
   * Calcula o frete preliminar pelo Motor de Fretes da Kantine considerando a loja de origem
   */
  public calculateOrderFreight(
    destinationNeighborhood: string,
    destinationAddress: string,
    pickupPresetKey: string = 'MATRIZ',
    vehicleCategory: 'MOTO' | 'CAR' = 'MOTO',
    dropoffCoords?: GeoCoordinate
  ) {
    const preset = PICKUP_PRESETS[pickupPresetKey] || PICKUP_PRESETS.MATRIZ;

    const stopInput: StopCalculationInput = {
      sequence: 1,
      destination_address: destinationAddress,
      destination_neighborhood: destinationNeighborhood,
      is_horizontal_condo: false,
      // Endereço exato (quando o Takeat informa); sem ele, o motor usa o centro do bairro
      ...(dropoffCoords ? { dropoff_coords: dropoffCoords } : {}),
    };

    const calculation = calculateRoutePricing(
      vehicleCategory,
      {
        name: preset.name,
        address: preset.address,
        coords: preset.coords,
      },
      [stopInput],
      DEFAULT_FREIGHT_PARAMETERS
    );

    return calculation;
  }

  /**
   * Processa Webhook do Takeat (quando pedido é aceito ou criado no delivery próprio)
   * Suporta multi-loja: Matriz e Vinhedos
   */
  public async processIncomingWebhook(
    rawPayload: any,
    explicitStoreKey?: string
  ): Promise<{
    order: TakeatOrderRecord;
    action: 'CREATED' | 'UPDATED' | 'IGNORED' | 'CANCELED';
    storeKey: 'MATRIZ' | 'VINHEDOS';
    reason?: string;
    /** Motivo, quando o rascunho de rota não pôde ser criado automaticamente. */
    draftError?: string;
  }> {
    const allConfigs = await this.getAllConfigs();

    // Desempacotar estruturas comuns de webhook do Takeat / iFood / MCP
    const payload = rawPayload?.data || rawPayload?.order || rawPayload?.body || rawPayload;

    // Detectar a loja correta (Matriz ou Vinhedos)
    let storeKey: 'MATRIZ' | 'VINHEDOS' = 'MATRIZ';
    const explicitUpper = explicitStoreKey?.toUpperCase();

    if (explicitUpper === 'VINHEDOS') {
      storeKey = 'VINHEDOS';
    } else if (explicitUpper === 'MATRIZ') {
      storeKey = 'MATRIZ';
    } else {
      // Tentar deduzir do payload através do store_id, merchantId ou slug
      const incomingStoreId = String(
        payload?.store_id ||
        payload?.storeId ||
        payload?.merchantId ||
        payload?.merchant_id ||
        payload?.unit_id ||
        payload?.unitId ||
        payload?.slug ||
        rawPayload?.store_id ||
        rawPayload?.storeId ||
        ''
      ).toLowerCase();

      if (
        (allConfigs.VINHEDOS.store_id && incomingStoreId === allConfigs.VINHEDOS.store_id.toLowerCase()) ||
        incomingStoreId.includes('vinhedos') ||
        incomingStoreId.includes('vinhedo')
      ) {
        storeKey = 'VINHEDOS';
      } else {
        storeKey = 'MATRIZ';
      }
    }

    const config = allConfigs[storeKey];

    // Atualiza timestamp do último webhook recebido para esta loja
    await db
      .update(takeatConfigs)
      .set({ last_webhook_received_at: new Date() })
      .where(eq(takeatConfigs.id, config.id));

    // Extrair identificadores
    const orderId = String(
      payload?.id ||
      payload?.orderId ||
      payload?.order_id ||
      payload?.codigo ||
      payload?.code ||
      Date.now()
    ).trim();

    const displayCode = String(
      payload?.displayId ||
      payload?.code ||
      payload?.numero ||
      payload?.orderNumber ||
      orderId.slice(-4)
    ).replace(/^#/, '');
    const displayId = `#${displayCode}`;

    // Cancelamento vindo da ponte do Zelo (pedido cancelado no Takeat depois de enviado)
    const event = String(rawPayload?.event || payload?.event || '');
    if (event === 'order.canceled') {
      const [existing] = await db.select().from(takeatOrders).where(eq(takeatOrders.takeat_order_id, orderId)).limit(1);
      if (!existing) throw new Error(`Pedido ${orderId} não encontrado para cancelar.`);
      // Rota ainda sem entregador (rascunho ou ofertada): cancela junto
      let routeCanceled = !existing.created_route_id;
      if (existing.created_route_id) {
        const route = await routeService.getRouteById(existing.created_route_id);
        if (!route || route.status === 'CANCELLED') routeCanceled = true;
        else if ((route.status === 'DRAFT' || route.status === 'OFFERED') && !route.accepted_driver_id) {
          await routeService.cancelRoute(route.id, 'TAKEAT', `Pedido ${existing.display_id} cancelado no Takeat`);
          routeCanceled = true;
        }
      }
      if (routeCanceled && (existing.status === 'PENDING_COURIER' || existing.status === 'IN_ROUTE')) {
        const [updated] = await db.update(takeatOrders).set({ status: 'DISMISSED' })
          .where(eq(takeatOrders.id, existing.id)).returning();
        return { order: updated as TakeatOrderRecord, action: 'CANCELED', storeKey };
      }
      console.warn(`[Takeat] Pedido ${existing.display_id} cancelado no Takeat, mas a rota #${existing.created_route_id ?? '-'} já tem entregador (${existing.status}): avise o entregador.`);
      return {
        order: existing as TakeatOrderRecord, action: 'IGNORED', storeKey,
        reason: `Cancelado no Takeat, mas já está ${existing.status}: avise o entregador.`,
      };
    }

    // Extrair dados do cliente
    const customer = payload?.customer || payload?.cliente || {};
    const customerName = String(
      customer?.name ||
      customer?.nome ||
      payload?.customerName ||
      payload?.nome_cliente ||
      'Cliente Takeat'
    ).trim();

    const customerPhone = String(
      customer?.phone ||
      customer?.telefone ||
      customer?.mobile ||
      payload?.customerPhone ||
      ''
    ).trim() || null;

    // Extrair endereço de entrega
    const delivery = payload?.delivery || payload?.endereco || payload?.deliveryAddress || payload?.address || {};
    const street = delivery?.street || delivery?.rua || delivery?.logradouro || delivery?.address || '';
    const number = delivery?.number || delivery?.numero || '';
    const complement = delivery?.complement || delivery?.complemento || '';
    const rawNeighborhood = delivery?.neighborhood || delivery?.bairro || '';
    const city = delivery?.city || delivery?.cidade || 'Uberlândia';

    let formattedAddress = '';
    if (street && number) {
      formattedAddress = `${street}, ${number}${complement ? ` - ${complement}` : ''}`;
    } else if (delivery?.formattedAddress) {
      formattedAddress = delivery.formattedAddress;
    } else if (street) {
      formattedAddress = `${street}${complement ? ` - ${complement}` : ''}`;
    } else {
      formattedAddress = 'Endereço não informado';
    }

    // Normalizar Bairro com a tabela de Uberlândia
    const matchedNeighborhood = this.matchUberlandiaNeighborhood(formattedAddress, rawNeighborhood);

    // Extrair Itens do Pedido
    const itemsRaw = payload?.items || payload?.itens || payload?.products || [];
    let itemsSummary = '';
    const itemsJson: any[] = [];

    if (Array.isArray(itemsRaw) && itemsRaw.length > 0) {
      const summaryParts: string[] = [];
      for (const item of itemsRaw) {
        const qty = item?.quantity || item?.quantidade || item?.qty || 1;
        const name = item?.name || item?.nome || item?.title || 'Item';
        summaryParts.push(`${qty}x ${name}`);
        itemsJson.push({
          name,
          quantity: qty,
          unit_price: item?.price || item?.preco || 0,
          total_price: (item?.price || item?.preco || 0) * qty,
          notes: item?.notes || item?.observacao || null,
        });
      }
      itemsSummary = summaryParts.join(', ');
    } else if (typeof payload?.notes === 'string') {
      itemsSummary = payload.notes;
    }

    // Extrair Valores Financeiros
    const orderTotal = payload?.total || payload?.orderAmount || payload?.valor_total || payload?.totalAmount || 0;
    const deliveryFeeCharged = payload?.deliveryFee || payload?.taxa_entrega || delivery?.fee || 0;

    // Extrair Pagamento
    const payments = payload?.payments || payload?.pagamento || payload?.payment || {};
    let paymentMethod = 'PIX';
    let changeFor: number | null = null;

    if (Array.isArray(payments) && payments.length > 0) {
      paymentMethod = payments[0]?.method || payments[0]?.tipo || 'PIX';
      if (payments[0]?.changeFor) changeFor = Number(payments[0].changeFor);
    } else if (typeof payments === 'object' && payments?.method) {
      paymentMethod = payments.method;
      if (payments.changeFor) changeFor = Number(payments.changeFor);
    } else if (payload?.paymentMethod) {
      paymentMethod = payload.paymentMethod;
    }

    // Calcular frete pelo Motor de Fretes da Kantine usando a loja específica (Matriz ou Vinhedos)
    const pickupPresetKey = storeKey === 'VINHEDOS' ? 'VINHEDOS' : (config.default_pickup_preset || 'MATRIZ');
    // Veículo do pedido: informado pela ponte (bolo → carro, demais → moto) ou o padrão da loja
    const incomingVehicle = String(payload?.vehicle || '').toUpperCase();
    const vehicleCategory: 'MOTO' | 'CAR' | null = incomingVehicle === 'CAR' || incomingVehicle === 'MOTO' ? incomingVehicle : null;
    const modality = vehicleCategory || config.preferred_modality || 'MOTO';
    const freightCalc = this.calculateOrderFreight(
      matchedNeighborhood,
      formattedAddress,
      pickupPresetKey,
      modality,
      dropoffCoordsOf(rawPayload)
    );

    const calculatedFreightValue = freightCalc.route_operational_total.toFixed(2);
    const storeIdVal = payload?.store_id || payload?.storeId || config.store_id || null;

    // Verificar se pedido já existe no banco
    const existingRows = await db
      .select()
      .from(takeatOrders)
      .where(eq(takeatOrders.takeat_order_id, orderId))
      .limit(1);

    if (existingRows.length > 0) {
      const existing = existingRows[0] as TakeatOrderRecord;

      // Se já foi despachado ou entregue, não reverter
      if (existing.status === 'IN_ROUTE' || existing.status === 'DELIVERED') {
        return {
          order: existing,
          action: 'IGNORED',
          storeKey,
          reason: `Pedido já se encontra com status ${existing.status}`,
        };
      }

      // Atualizar dados do pedido
      const [updated] = await db
        .update(takeatOrders)
        .set({
          store_key: storeKey,
          store_id: storeIdVal,
          display_id: displayId,
          customer_name: customerName,
          customer_phone: customerPhone,
          destination_address: formattedAddress,
          destination_neighborhood: matchedNeighborhood,
          destination_city: city,
          order_items_summary: itemsSummary || existing.order_items_summary,
          order_items_json: itemsJson.length > 0 ? itemsJson : existing.order_items_json,
          order_total: Number(orderTotal) > 0 ? Number(orderTotal).toFixed(2) : existing.order_total,
          delivery_fee_charged: Number(deliveryFeeCharged) > 0 ? Number(deliveryFeeCharged).toFixed(2) : existing.delivery_fee_charged,
          payment_method: paymentMethod,
          change_for: changeFor ? changeFor.toFixed(2) : existing.change_for,
          pickup_preset: pickupPresetKey,
          calculated_freight_value: calculatedFreightValue,
          calculated_freight_details: freightCalc,
          raw_payload: rawPayload,
        })
        .where(eq(takeatOrders.id, existing.id))
        .returning();

      return {
        order: updated as TakeatOrderRecord,
        action: 'UPDATED',
        storeKey,
      };
    }

    // Inserir novo pedido aguardando entregador
    const [inserted] = await db
      .insert(takeatOrders)
      .values({
        takeat_order_id: orderId,
        store_key: storeKey,
        store_id: storeIdVal,
        display_id: displayId,
        customer_name: customerName,
        customer_phone: customerPhone,
        destination_address: formattedAddress,
        destination_neighborhood: matchedNeighborhood,
        destination_city: city,
        order_items_summary: itemsSummary || 'Pedido Kantine Delivery',
        order_items_json: itemsJson,
        order_total: Number(orderTotal) > 0 ? Number(orderTotal).toFixed(2) : '0.00',
        delivery_fee_charged: Number(deliveryFeeCharged) > 0 ? Number(deliveryFeeCharged).toFixed(2) : '0.00',
        payment_method: paymentMethod,
        change_for: changeFor ? changeFor.toFixed(2) : null,
        pickup_preset: pickupPresetKey,
        status: 'PENDING_COURIER',
        calculated_freight_value: calculatedFreightValue,
        calculated_freight_details: freightCalc,
        raw_payload: rawPayload,
        accepted_at: new Date(),
      })
      .returning();

    // Como as entregas avulsas: o pedido vira um RASCUNHO em "Rotas de Entrega", aguardando revisão e publicação.
    // Se falhar, o pedido continua na aba de pedidos Takeat para criar a rota manualmente.
    let order = inserted as TakeatOrderRecord;
    let draftError: string | undefined;
    try {
      order = (await this.convertOrderToRoute(order.id, { offerNow: false, asDraftRoute: true })).order;
    } catch (e: any) {
      draftError = String(e?.message || e);
      console.warn(`[Takeat] Pedido ${displayId}: não foi possível criar o rascunho de rota (${draftError}). Fica aguardando na aba Takeat.`);
    }

    return {
      order: withVehicle(order),
      action: 'CREATED',
      storeKey,
      draftError,
    };
  }

  /**
   * Lista pedidos do Takeat com filtros por status e por loja
   */
  public async getOrders(statusFilter?: string, storeKeyFilter?: string): Promise<TakeatOrderRecord[]> {
    const conditions: any[] = [];

    if (statusFilter && statusFilter !== 'ALL') {
      conditions.push(eq(takeatOrders.status, statusFilter));
    }

    if (storeKeyFilter && storeKeyFilter !== 'ALL') {
      conditions.push(eq(takeatOrders.store_key, storeKeyFilter));
    }

    let query = db.select().from(takeatOrders);

    if (conditions.length === 1) {
      const rows = await query.where(conditions[0]).orderBy(desc(takeatOrders.created_at)).limit(60);
      return (rows as TakeatOrderRecord[]).map(withVehicle);
    } else if (conditions.length > 1) {
      const rows = await query.where(and(...conditions)).orderBy(desc(takeatOrders.created_at)).limit(60);
      return (rows as TakeatOrderRecord[]).map(withVehicle);
    }

    const rows = await query.orderBy(desc(takeatOrders.created_at)).limit(60);
    return (rows as TakeatOrderRecord[]).map(withVehicle);
  }

  /**
   * Retorna a quantidade de pedidos aguardando entregador (PENDING_COURIER)
   */
  public async getPendingCount(): Promise<{ total: number; matriz: number; vinhedos: number }> {
    const rows = await db
      .select({
        store_key: takeatOrders.store_key,
        count: sql<number>`count(*)`,
      })
      .from(takeatOrders)
      .where(eq(takeatOrders.status, 'PENDING_COURIER'))
      .groupBy(takeatOrders.store_key);

    let matrizCount = 0;
    let vinhedosCount = 0;

    for (const r of rows) {
      if (r.store_key === 'VINHEDOS') {
        vinhedosCount += Number(r.count || 0);
      } else {
        matrizCount += Number(r.count || 0);
      }
    }

    return {
      total: matrizCount + vinhedosCount,
      matriz: matrizCount,
      vinhedos: vinhedosCount,
    };
  }

  /**
   * Transforma um pedido do Takeat em uma Rota (Rascunho ou Oferta Ativa)
   */
  public async convertOrderToRoute(
    orderId: number,
    options?: {
      offerNow?: boolean;
      modality?: 'MOTO' | 'CAR';
      pickupPreset?: string;
      /** Rascunho criado automaticamente: o pedido sai de "Aguardando entregador" (a rota está em Rotas de Entrega). */
      asDraftRoute?: boolean;
    }
  ): Promise<{ route: any; order: TakeatOrderRecord }> {
    const rows = await db.select().from(takeatOrders).where(eq(takeatOrders.id, orderId)).limit(1);
    if (rows.length === 0) {
      throw new Error('TAKEAT_ORDER_NOT_FOUND');
    }

    const order = rows[0] as TakeatOrderRecord;
    const config = await this.getConfig(order.store_key || 'MATRIZ');

    // O veículo definido no pedido (bolo → carro) prevalece sobre o padrão da loja
    const modality = vehicleOf(order).vehicle_category || options?.modality || config.preferred_modality || 'MOTO';
    const pickupPresetKey = options?.pickupPreset || order.pickup_preset || (order.store_key === 'VINHEDOS' ? 'VINHEDOS' : 'MATRIZ');
    const pickupPreset = PICKUP_PRESETS[pickupPresetKey] || PICKUP_PRESETS.MATRIZ;

    // Recalcula o frete pelo motor da Kantine
    const freightCalc = this.calculateOrderFreight(
      order.destination_neighborhood,
      order.destination_address,
      pickupPresetKey,
      modality,
      dropoffCoordsOf(order.raw_payload)
    );

    const storeLabel = order.store_key === 'VINHEDOS' ? 'Vinhedos' : 'Matriz';
    const channelLabel = (order.raw_payload as any)?.channel === 'site' ? 'Pedido do site' : 'Pedido Takeat';
    const cargoDescription = `${channelLabel} ${order.display_id} (${storeLabel}) — ${order.customer_name}${
      order.order_items_summary ? ` | ${order.order_items_summary}` : ''
    }`;

    // Monta o rascunho de rota via routeService
    const createdRoute = await routeService.createDraft(
      {
        pickup_type: 'REGISTERED',
        pickup_location_id: await this.pickupLocationId(pickupPresetKey === 'VINHEDOS' ? 'VINHEDOS' : 'MATRIZ'),
        final_deadline: this.routeDeadline(order),
        // Mesmo critério do simulador: valor da corrida = preço da tabela (antes era só o repasse de 90%)
        total_fee: freightCalc.route_operational_total.toFixed(2),
        accepted_vehicle_types: modality === 'CAR' ? ['CAR'] : ['MOTO', 'MOTO_WITH_BAG'],
        stops: [
          {
            destination_address: order.destination_address,
            destination_neighborhood: order.destination_neighborhood,
            cargo_description: cargoDescription,
            is_horizontal_condo: false,
            delivery_mode: 'IN_PERSON',
            observations: this.stopObservations(order, storeLabel),
          },
        ],
      },
      'TAKEAT_ORDER'
    );

    // Pedido agendado (Takeat ou site): a rota já nasce com a data/hora de entrega,
    // pronta para "Agendar oferta" (publicação automática antes do horário)
    const scheduledTo = (order.raw_payload as any)?.scheduledTo;
    if (scheduledTo && Date.parse(scheduledTo) > Date.now()) {
      await scheduleService.setScheduledFor(createdRoute.id, new Date(scheduledTo)).catch((e: any) =>
        console.warn(`[Takeat] rota #${createdRoute.id}: data de entrega não registrada (${e?.message})`)
      );
    }

    // Se solicitado ofertar imediatamente aos entregadores
    if (options?.offerNow) {
      try {
        await routeService.publishRoute(createdRoute.id, 'TAKEAT_AUTO_DISPATCH');
      } catch (e: any) {
        console.warn(`[TakeatService] Failed to dispatch instant offer: ${e.message}`);
      }
    }

    // Atualiza o pedido Takeat com o ID da rota e status
    const [updatedOrder] = await db
      .update(takeatOrders)
      .set({
        created_route_id: createdRoute.id,
        status: options?.offerNow || options?.asDraftRoute ? 'IN_ROUTE' : 'PENDING_COURIER',
        dispatched_at: options?.offerNow ? new Date() : null,
      })
      .where(eq(takeatOrders.id, order.id))
      .returning();

    return {
      route: createdRoute,
      order: updatedOrder as TakeatOrderRecord,
    };
  }

  /** Local de coleta cadastrado da unidade (pelo nome: "Matriz"/"Vinhedos"); se não achar, os ids padrão 1/2. */
  private async pickupLocationId(store: 'MATRIZ' | 'VINHEDOS'): Promise<number> {
    const fallback = store === 'VINHEDOS' ? 2 : 1;
    try {
      const all = await routeService.getPickupLocations();
      const active = all.filter((p: any) => p.active !== false);
      const want = store === 'VINHEDOS' ? /vinhedo/i : /matriz/i;
      const byName = active.find((p: any) => want.test(String(p.name || '')));
      if (byName) return Number(byName.id);
      if (active.some((p: any) => Number(p.id) === fallback)) return fallback;
      if (store === 'MATRIZ' && active.length === 1) return Number(active[0].id);
    } catch { /* usa o padrão */ }
    return fallback;
  }

  /** Prazo da rota: horário agendado do Takeat, se houver; senão o padrão de 50 min. */
  private routeDeadline(order: TakeatOrderRecord): string {
    const when = (order.raw_payload as any)?.scheduledTo;
    if (!when || !Number.isFinite(Date.parse(when))) return '50 min';
    return `Agendado ${new Date(when).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`;
  }

  /** Observações da parada para o entregador (cobrança, troco, referência, horário agendado). */
  private stopObservations(order: TakeatOrderRecord, storeLabel: string): string {
    const raw: any = order.raw_payload || {};
    if (raw?.source !== 'kantine-zelo-bridge') {
      return `Originado do Takeat (${storeLabel}). Valor pedido: R$ ${order.order_total || '0,00'}. Pagto: ${order.payment_method || 'PIX'}`;
    }
    const d = raw.delivery || {};
    const brl = (n: unknown) => `R$ ${Number(n || 0).toFixed(2).replace('.', ',')}`;
    const when = raw.scheduledTo
      ? new Date(raw.scheduledTo).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })
      : '';
    return [
      `${raw.channel === 'site' ? 'Site' : 'Takeat'} ${order.display_id} (${storeLabel})`,
      vehicleOf(order).vehicle_category === 'CAR' ? `CARRO${vehicleOf(order).vehicle_reason ? ` (${vehicleOf(order).vehicle_reason})` : ''}` : '',
      raw.isPaid ? `PAGO (${brl(raw.total)})` : String(order.payment_method || `Cobrar ${brl(raw.amountToCollect)} na entrega`).toUpperCase(),
      order.change_for && Number(order.change_for) > 0 ? `Troco para ${brl(order.change_for)}` : '',
      d.reference ? `Ref.: ${d.reference}` : '',
      d.zipCode ? `CEP ${d.zipCode}` : '',
      when ? `Agendado: ${when}` : '',
      order.customer_phone ? `Tel.: ${order.customer_phone}` : '',
      raw.notes ? `Obs.: ${raw.notes}` : '',
    ].filter(Boolean).join(' · ');
  }

  /**
   * Descarta / dispensa pedido
   */
  public async dismissOrder(orderId: number): Promise<TakeatOrderRecord> {
    const [updated] = await db
      .update(takeatOrders)
      .set({ status: 'DISMISSED' })
      .where(eq(takeatOrders.id, orderId))
      .returning();

    if (!updated) throw new Error('ORDER_NOT_FOUND');
    return updated as TakeatOrderRecord;
  }

  /**
   * Exclui pedido
   */
  public async deleteOrder(orderId: number): Promise<boolean> {
    await db.delete(takeatOrders).where(eq(takeatOrders.id, orderId));
    return true;
  }

  /**
   * Simula um pedido de teste realista vindo do Takeat para Matriz ou Vinhedos
   */
  public async simulateTestOrder(preset?: {
    storeKey?: 'MATRIZ' | 'VINHEDOS';
    neighborhood?: string;
    items?: string;
    customerName?: string;
    total?: number;
  }): Promise<TakeatOrderRecord & { draft_error?: string | null }> {
    const storeKey = preset?.storeKey || (Math.random() > 0.5 ? 'VINHEDOS' : 'MATRIZ');
    
    // Bairros próximos de cada unidade para realismo
    const matrizNeighborhoods = ['Fundinho', 'Martins', 'Tibery', 'Centro', 'Osvaldo Rezende', 'Daniel Fonseca'];
    const vinhedosNeighborhoods = ['Santa Mônica', 'Granada', 'Saraiva', 'Karaíba', 'Jardim Inconfidência', 'Pampulha'];
    
    const candidateNeighborhoods = storeKey === 'VINHEDOS' ? vinhedosNeighborhoods : matrizNeighborhoods;
    const selectedNeighborhood = preset?.neighborhood || candidateNeighborhoods[Math.floor(Math.random() * candidateNeighborhoods.length)];

    const sampleStreets: Record<string, string> = {
      'Fundinho': 'Rua Tiradentes, 210',
      'Martins': 'Rua Goiás, 520 - Apto 302',
      'Tibery': 'Av. Floriano Peixoto, 1420',
      'Centro': 'Av. Afonso Pena, 890',
      'Osvaldo Rezende': 'Rua Arthur Bernardes, 310',
      'Daniel Fonseca': 'Rua General Osório, 145',
      'Santa Mônica': 'Rua dos Cravos, 350',
      'Granada': 'Av. Dr. Vicente Salles, 185',
      'Saraiva': 'Rua Silva Jardim, 89',
      'Karaíba': 'Alameda dos Ipês, 720',
      'Jardim Inconfidência': 'Rua das Camélias, 102',
      'Pampulha': 'Av. dos Municípios, 610',
    };

    const street = sampleStreets[selectedNeighborhood] || 'Av. Floriano Peixoto, 1420';
    const sampleItems = [
      '1x Torta Holandesa (Fatia), 1x Cappuccino Avelã',
      '2x Quiche Lorraine, 1x Suco Natural de Laranja',
      '1x Bolo Red Velvet Pequeno, 2x Croissant Tradicional',
      '1x Cesta Café Kantine Especial',
      '2x Empada de Frango com Catupiry, 1x Café Expresso',
    ];
    const itemsSummary = preset?.items || sampleItems[Math.floor(Math.random() * sampleItems.length)];

    const customerNames = ['Mariana Siqueira', 'Lucas Rezende', 'Ana Paula Castro', 'Rodrigo Mendes', 'Carla Fernandes', 'Bruno Alvarenga'];
    const customerName = preset?.customerName || customerNames[Math.floor(Math.random() * customerNames.length)];

    const orderNumber = Math.floor(1030 + Math.random() * 890);
    const orderId = `TK-${storeKey === 'VINHEDOS' ? 'VIN' : 'MAT'}-${orderNumber}`;
    const displayId = `#${orderNumber}`;

    const total = preset?.total || Number((45 + Math.random() * 65).toFixed(2));
    const deliveryFee = 10.0; // Taxa padrão do raio Takeat

    const allConfigs = await this.getAllConfigs();
    const storeConfig = allConfigs[storeKey];

    const result = await this.processIncomingWebhook(
      {
        id: orderId,
        code: orderNumber,
        orderNumber,
        store_id: storeConfig.store_id || (storeKey === 'VINHEDOS' ? 'kantine-vinhedos' : 'kantine-matriz'),
        customer: {
          name: customerName,
          phone: '(34) 99842-' + Math.floor(1000 + Math.random() * 9000),
        },
        delivery: {
          address: street,
          neighborhood: selectedNeighborhood,
          city: 'Uberlândia',
          fee: deliveryFee,
        },
        items: [
          { name: itemsSummary, quantity: 1, price: total },
        ],
        total,
        deliveryFee,
        payments: [
          { method: 'PIX', total },
        ],
      },
      storeKey
    );

    return { ...result.order, draft_error: result.draftError || null } as TakeatOrderRecord & { draft_error: string | null };
  }

  /**
   * Consulta ativa à API REST da Takeat usando a Chave de REST (Bearer Token)
   */
  public async syncOrdersFromRestApi(storeKey: 'MATRIZ' | 'VINHEDOS' = 'MATRIZ'): Promise<{
    success: boolean;
    syncedCount: number;
    orders: TakeatOrderRecord[];
    message: string;
  }> {
    const config = await this.getConfig(storeKey);
    if (!config.api_key) {
      throw new Error('CHAVE_REST_NAO_CONFIGURADA: Cole e salve a Chave de REST gerada no Takeat antes de sincronizar.');
    }

    const possibleEndpoints = [
      `https://api.takeat.app/v1/orders`,
      `https://api.takeat.app/v1/pedidos`,
      `https://api.takeat.app/v1/orders?status=ACCEPTED`,
      `https://api.takeat.app/externo/v1/pedidos?status=aceito`,
      `https://api.takeat.app/api/v1/pedidos`,
      `https://webhook.takeat.app/api/v1/pedidos`,
      `https://webhook.takeat.app/api/v1/comandas`,
      `https://api.takeat.app/v1/comandas`,
      `https://api.takeat.app/v1/merchants/${config.store_id || ''}/orders`,
    ];

    let remoteOrders: any[] = [];
    let lastStatus = 0;
    let lastResponseSnippet = '';

    for (const url of possibleEndpoints) {
      // Tentar com Bearer Token e com x-api-key
      const headerVariants: Record<string, string>[] = [
        {
          'Authorization': `Bearer ${config.api_key.trim()}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        {
          'x-api-key': config.api_key.trim(),
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
      ];

      for (const headers of headerVariants) {
        try {
          const response = await fetch(url, { headers });
          lastStatus = response.status;
          if (response.ok) {
            const data = await response.json();
            const items = Array.isArray(data) ? data : data?.data || data?.orders || data?.pedidos || data?.content || [];
            if (Array.isArray(items) && items.length > 0) {
              remoteOrders = items;
              break;
            } else if (Array.isArray(items)) {
              // Endpoint respondeu 200 OK válido
              lastResponseSnippet = '200_EMPTY';
            }
          } else {
            const errText = await response.text().catch(() => '');
            if (errText) lastResponseSnippet = errText.slice(0, 150);
          }
        } catch (err: any) {
          console.warn(`[Takeat REST sync] Error fetching ${url}: ${err.message}`);
        }
      }

      if (remoteOrders.length > 0) break;
    }

    const processedOrders: TakeatOrderRecord[] = [];
    for (const remote of remoteOrders) {
      const res = await this.processIncomingWebhook(remote, storeKey);
      processedOrders.push(res.order);
    }

    return {
      success: true,
      syncedCount: processedOrders.length,
      orders: processedOrders,
      message: processedOrders.length > 0
        ? `${processedOrders.length} pedido(s) da ${storeKey === 'VINHEDOS' ? 'Vinhedos' : 'Matriz'} importado(s) com sucesso via API REST!`
        : lastStatus === 401 || lastStatus === 403
        ? 'Chave REST conectada, mas o Takeat retornou autorização pendente. Verifique se a chave tem permissão de leitura de pedidos.'
        : 'Conexão com a API REST efetuada com sucesso! Nenhum pedido com entrega pendente no momento.',
    };
  }
}

export const takeatService = new TakeatService();
