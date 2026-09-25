import { db } from '../db/index.ts';
import {
  deliveryModalities,
  neighborhoods,
  deliveryConfigurations,
  freightPrices,
} from '../db/schema.ts';
import { eq, and, sql, desc, asc } from 'drizzle-orm';
import {
  DeliveryModality,
  Neighborhood,
  FreightPrice,
  DeliveryConfiguration,
  PricingVehicleCategory,
  normalizeNeighborhoodName,
} from './types.ts';

export class DeliveryConfigService {
  // ==========================================
  // 1. Modalidades de Entrega (M4.2 Parte B)
  // ==========================================

  public async getModalities(activeOnly: boolean = false): Promise<DeliveryModality[]> {
    let query = db.select().from(deliveryModalities);
    if (activeOnly) {
      return (await query.where(eq(deliveryModalities.active, true)).orderBy(asc(deliveryModalities.name))) as DeliveryModality[];
    }
    return (await query.orderBy(asc(deliveryModalities.name))) as DeliveryModality[];
  }

  public async getModalityByCode(code: string): Promise<DeliveryModality | null> {
    const rows = await db
      .select()
      .from(deliveryModalities)
      .where(eq(deliveryModalities.code, code.trim().toUpperCase()));
    return (rows[0] as DeliveryModality) || null;
  }

  public async createModality(data: { name: string; code: string }): Promise<DeliveryModality> {
    const code = data.code.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    const name = data.name.trim();

    if (!code || !name) {
      throw new Error('INVALID_MODALITY_DATA: Nome e código são obrigatórios');
    }

    const existing = await this.getModalityByCode(code);
    if (existing) {
      throw new Error('MODALITY_CODE_ALREADY_EXISTS: Já existe uma modalidade com este código');
    }

    const [row] = await db
      .insert(deliveryModalities)
      .values({
        name,
        code,
        active: true,
      })
      .returning();

    return row as DeliveryModality;
  }

  public async updateModality(
    id: number,
    data: { name?: string; active?: boolean }
  ): Promise<DeliveryModality> {
    const updateValues: any = { updated_at: new Date() };
    if (data.name !== undefined) updateValues.name = data.name.trim();
    if (data.active !== undefined) updateValues.active = data.active;

    const [updated] = await db
      .update(deliveryModalities)
      .set(updateValues)
      .where(eq(deliveryModalities.id, id))
      .returning();

    if (!updated) throw new Error('MODALITY_NOT_FOUND');
    return updated as DeliveryModality;
  }

  // ==========================================
  // 2. Bairros e Normalização (M4.2 Parte D)
  // ==========================================

  public async getNeighborhoods(activeOnly: boolean = false): Promise<Neighborhood[]> {
    let query = db.select().from(neighborhoods);
    if (activeOnly) {
      return (await query.where(eq(neighborhoods.active, true)).orderBy(asc(neighborhoods.name))) as Neighborhood[];
    }
    return (await query.orderBy(asc(neighborhoods.name))) as Neighborhood[];
  }

  public async getNeighborhoodById(id: number): Promise<Neighborhood | null> {
    const rows = await db.select().from(neighborhoods).where(eq(neighborhoods.id, id));
    return (rows[0] as Neighborhood) || null;
  }

  public async getNeighborhoodByNormalizedName(normalizedName: string): Promise<Neighborhood | null> {
    const rows = await db
      .select()
      .from(neighborhoods)
      .where(eq(neighborhoods.normalized_name, normalizedName));
    return (rows[0] as Neighborhood) || null;
  }

  public async findOrCreateNeighborhood(name: string): Promise<Neighborhood> {
    const trimmed = name.trim();
    const normalized = normalizeNeighborhoodName(trimmed);
    if (!normalized) throw new Error('INVALID_NEIGHBORHOOD_NAME');

    const existing = await this.getNeighborhoodByNormalizedName(normalized);
    if (existing) return existing;

    const [row] = await db
      .insert(neighborhoods)
      .values({
        name: trimmed,
        normalized_name: normalized,
        active: true,
      })
      .returning();

    return row as Neighborhood;
  }

  public async createNeighborhood(name: string): Promise<Neighborhood> {
    const trimmed = name.trim();
    const normalized = normalizeNeighborhoodName(trimmed);

    if (!trimmed || !normalized) {
      throw new Error('INVALID_NEIGHBORHOOD_NAME: Nome do bairro é obrigatório');
    }

    const existing = await this.getNeighborhoodByNormalizedName(normalized);
    if (existing) {
      throw new Error(`NEIGHBORHOOD_ALREADY_EXISTS: O bairro "${existing.name}" já está cadastrado`);
    }

    const [row] = await db
      .insert(neighborhoods)
      .values({
        name: trimmed,
        normalized_name: normalized,
        active: true,
      })
      .returning();

    return row as Neighborhood;
  }

  public async updateNeighborhood(
    id: number,
    data: { name?: string; active?: boolean }
  ): Promise<Neighborhood> {
    const updateValues: any = { updated_at: new Date() };
    if (data.name !== undefined) {
      updateValues.name = data.name.trim();
      updateValues.normalized_name = normalizeNeighborhoodName(data.name.trim());
    }
    if (data.active !== undefined) updateValues.active = data.active;

    const [updated] = await db
      .update(neighborhoods)
      .set(updateValues)
      .where(eq(neighborhoods.id, id))
      .returning();

    if (!updated) throw new Error('NEIGHBORHOOD_NOT_FOUND');
    return updated as Neighborhood;
  }

  // ==========================================
  // 3. Configurações de Entrega (M4.2 Parte G & H)
  // ==========================================

  public async getDeliveryConfig(): Promise<DeliveryConfiguration> {
    const rows = await db.select().from(deliveryConfigurations);
    const map = new Map(rows.map((r) => [r.key, r.value]));

    const managementRateStr = map.get('LOGISTICS_MANAGEMENT_RATE') || '0.10';
    const routeDiscountStr = map.get('DEFAULT_ROUTE_DISCOUNT_PERCENT') || '0.20';

    return {
      logistics_management_rate: parseFloat(managementRateStr) || 0.10,
      default_route_discount_percent: parseFloat(routeDiscountStr) || 0.20,
    };
  }

  public async updateDeliveryConfig(
    key: 'LOGISTICS_MANAGEMENT_RATE' | 'DEFAULT_ROUTE_DISCOUNT_PERCENT',
    value: string | number
  ): Promise<DeliveryConfiguration> {
    const numValue = typeof value === 'number' ? value : parseFloat(value.replace(',', '.'));
    if (isNaN(numValue) || numValue < 0 || numValue > 1) {
      throw new Error('INVALID_CONFIG_VALUE: O percentual deve ser um decimal entre 0 e 1 (ex: 0.10 para 10%)');
    }

    await db
      .insert(deliveryConfigurations)
      .values({
        key,
        value: numValue.toFixed(4),
        updated_at: new Date(),
      })
      .onConflictDoUpdate({
        target: deliveryConfigurations.key,
        set: {
          value: numValue.toFixed(4),
          updated_at: new Date(),
        },
      });

    return this.getDeliveryConfig();
  }

  // ==========================================
  // 4. Tabela de Fretes / Matriz Tarifária (M4.2 Parte E)
  // ==========================================

  public async getFreightPrices(filters?: {
    neighborhood_id?: number;
    modality_code?: string;
    vehicle_category?: string;
    activeOnly?: boolean;
  }): Promise<FreightPrice[]> {
    let query = db
      .select({
        id: freightPrices.id,
        neighborhood_id: freightPrices.neighborhood_id,
        modality_code: freightPrices.modality_code,
        vehicle_category: freightPrices.vehicle_category,
        price: freightPrices.price,
        active: freightPrices.active,
        created_at: freightPrices.created_at,
        updated_at: freightPrices.updated_at,
        neighborhood_name: neighborhoods.name,
      })
      .from(freightPrices)
      .leftJoin(neighborhoods, eq(freightPrices.neighborhood_id, neighborhoods.id));

    const conditions = [];

    if (filters?.neighborhood_id) {
      conditions.push(eq(freightPrices.neighborhood_id, filters.neighborhood_id));
    }
    if (filters?.modality_code) {
      conditions.push(eq(freightPrices.modality_code, filters.modality_code));
    }
    if (filters?.vehicle_category) {
      conditions.push(eq(freightPrices.vehicle_category, filters.vehicle_category));
    }
    if (filters?.activeOnly) {
      conditions.push(eq(freightPrices.active, true));
    }

    const rows = conditions.length > 0
      ? await query.where(and(...conditions)).orderBy(asc(neighborhoods.name))
      : await query.orderBy(asc(neighborhoods.name));

    return rows.map((r) => ({
      ...r,
      price: parseFloat(String(r.price)),
      vehicle_category: r.vehicle_category as PricingVehicleCategory,
      neighborhood_name: r.neighborhood_name || undefined,
    }));
  }

  public async upsertFreightPrice(data: {
    neighborhood_id: number;
    modality_code: string;
    vehicle_category: PricingVehicleCategory;
    price: number;
    active?: boolean;
  }): Promise<FreightPrice> {
    if (!['CAR', 'MOTO', 'MOTO_WITH_BAG'].includes(data.vehicle_category)) {
      throw new Error(`INVALID_VEHICLE_CATEGORY: Categoria tarifária inválida: ${data.vehicle_category}`);
    }

    if (isNaN(data.price) || data.price < 0) {
      throw new Error('INVALID_PRICE: Preço inválido');
    }

    const existing = await db
      .select()
      .from(freightPrices)
      .where(
        and(
          eq(freightPrices.neighborhood_id, data.neighborhood_id),
          eq(freightPrices.modality_code, data.modality_code),
          eq(freightPrices.vehicle_category, data.vehicle_category)
        )
      );

    if (existing.length > 0) {
      const [updated] = await db
        .update(freightPrices)
        .set({
          price: data.price.toFixed(2),
          active: data.active !== undefined ? data.active : true,
          updated_at: new Date(),
        })
        .where(eq(freightPrices.id, existing[0].id))
        .returning();

      return {
        ...updated,
        price: parseFloat(String(updated.price)),
        vehicle_category: updated.vehicle_category as PricingVehicleCategory,
      };
    }

    const [inserted] = await db
      .insert(freightPrices)
      .values({
        neighborhood_id: data.neighborhood_id,
        modality_code: data.modality_code,
        vehicle_category: data.vehicle_category,
        price: data.price.toFixed(2),
        active: data.active !== undefined ? data.active : true,
      })
      .returning();

    return {
      ...inserted,
      price: parseFloat(String(inserted.price)),
      vehicle_category: inserted.vehicle_category as PricingVehicleCategory,
    };
  }

  /**
   * Buscar preço sugerido de referência na matriz tarifária
   */
  public async getSuggestedFreightPrice(
    neighborhoodIdOrName: number | string,
    modalityCode: string,
    vehicleCategory: PricingVehicleCategory
  ): Promise<{ price: number; source: 'TABLE' | 'NONE' }> {
    let neighborhoodId: number | null = null;

    if (typeof neighborhoodIdOrName === 'number') {
      neighborhoodId = neighborhoodIdOrName;
    } else {
      const norm = normalizeNeighborhoodName(neighborhoodIdOrName);
      const n = await this.getNeighborhoodByNormalizedName(norm);
      if (n) neighborhoodId = n.id;
    }

    if (!neighborhoodId) {
      return { price: 0, source: 'NONE' };
    }

    const rows = await db
      .select()
      .from(freightPrices)
      .where(
        and(
          eq(freightPrices.neighborhood_id, neighborhoodId),
          eq(freightPrices.modality_code, modalityCode),
          eq(freightPrices.vehicle_category, vehicleCategory),
          eq(freightPrices.active, true)
        )
      );

    if (rows.length > 0) {
      return { price: parseFloat(String(rows[0].price)), source: 'TABLE' };
    }

    return { price: 0, source: 'NONE' };
  }

  // ==========================================
  // 5. Cálculo Financeiro de Rota (M4.2 Parte G & H)
  // ==========================================

  public calculateRoutePricing(
    stops: { customer_freight: number }[],
    rates?: {
      logistics_management_rate?: number;
      default_route_discount_percent?: number;
    }
  ): {
    management_rate: number;
    route_discount_percent: number;
    stopsBreakdown: {
      customer_freight: number;
      net_delivery_base: number;
      management_amount: number;
    }[];
    customer_freight_total: number;
    management_amount_total: number;
    route_base_amount: number;
    suggested_driver_fee: number;
  } {
    const managementRate = rates?.logistics_management_rate !== undefined ? rates.logistics_management_rate : 0.10;
    const discountPercent = rates?.default_route_discount_percent !== undefined ? rates.default_route_discount_percent : 0.20;

    let customerFreightTotal = 0;
    let managementAmountTotal = 0;
    let routeBaseAmount = 0;

    const stopsBreakdown = stops.map((s) => {
      const freight = Math.round(s.customer_freight * 100) / 100;
      // Formula (Seção 22):
      // net_delivery_base = customer_freight / (1 + management_rate)
      // management_amount = customer_freight - net_delivery_base
      const netBase = Math.round((freight / (1 + managementRate)) * 100) / 100;
      const mgmt = Math.round((freight - netBase) * 100) / 100;

      customerFreightTotal += freight;
      managementAmountTotal += mgmt;
      routeBaseAmount += netBase;

      return {
        customer_freight: freight,
        net_delivery_base: netBase,
        management_amount: mgmt,
      };
    });

    customerFreightTotal = Math.round(customerFreightTotal * 100) / 100;
    managementAmountTotal = Math.round(managementAmountTotal * 100) / 100;
    routeBaseAmount = Math.round(routeBaseAmount * 100) / 100;

    // Seção 26 & 27: Rota com múltiplas stops aplica desconto; rota de 1 stop NÃO aplica desconto
    let suggestedDriverFee = 0;
    if (stops.length > 1) {
      suggestedDriverFee = Math.round(routeBaseAmount * (1 - discountPercent) * 100) / 100;
    } else {
      suggestedDriverFee = routeBaseAmount;
    }

    return {
      management_rate: managementRate,
      route_discount_percent: discountPercent,
      stopsBreakdown,
      customer_freight_total: customerFreightTotal,
      management_amount_total: managementAmountTotal,
      route_base_amount: routeBaseAmount,
      suggested_driver_fee: suggestedDriverFee,
    };
  }
}

export const deliveryConfigService = new DeliveryConfigService();
