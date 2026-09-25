/**
 * Route Service - Kantine Delivery M2.1
 * Handles Multi-Stop Routes, Pickup Locations and Vehicle Compatibility.
 * Preserves M1, M2, and M3 baseline: atomic acceptance, eligibility filter, single winner.
 */

import { db } from '../db/index.ts';
import {
  pickupLocations,
  routes,
  routeStops,
  routeOfferDispatches,
  routeEvents,
  drivers,
} from '../db/schema.ts';
import { eq, desc, asc, and, sql } from 'drizzle-orm';
import {
  Route,
  RouteStop,
  RouteStatus,
  RouteOfferDispatch,
  RouteEvent,
  CreateRouteDTO,
  CreateRouteStopDTO,
  AcceptRouteResult,
  PickupLocation,
  VehicleType,
  Driver,
  IncidentType,
  IncidentResolutionType,
  IncidentResolutionStatus,
  PaymentStatus,
} from './types.ts';
import { canReceiveRouteOffer } from './eligibility.ts';
import { telegramBot } from './telegramBot.ts';
import { driverService } from './driverService.ts';
import { deliveryConfigService } from './deliveryConfigService.ts';

export class RouteService {
  // ==========================================
  // Pickup Locations Management (M2.1 Seção 12)
  // ==========================================

  public async getPickupLocations(): Promise<PickupLocation[]> {
    const rows = await db
      .select()
      .from(pickupLocations)
      .orderBy(asc(pickupLocations.name));
    return rows as PickupLocation[];
  }

  public async getPickupLocationById(id: number): Promise<PickupLocation | null> {
    const rows = await db
      .select()
      .from(pickupLocations)
      .where(eq(pickupLocations.id, id));
    if (rows.length === 0) return null;
    return rows[0] as PickupLocation;
  }

  public async createPickupLocation(data: {
    name: string;
    address: string;
    neighborhood?: string | null;
    active?: boolean;
  }): Promise<PickupLocation> {
    if (!data.name?.trim() || !data.address?.trim()) {
      throw new Error('MISSING_PICKUP_LOCATION_FIELDS');
    }

    const [created] = await db
      .insert(pickupLocations)
      .values({
        name: data.name.trim(),
        address: data.address.trim(),
        neighborhood: data.neighborhood?.trim() || null,
        active: data.active !== undefined ? Boolean(data.active) : true,
      })
      .returning();

    return created as PickupLocation;
  }

  public async updatePickupLocation(
    id: number,
    data: { name?: string; address?: string; neighborhood?: string | null; active?: boolean }
  ): Promise<PickupLocation> {
    const existing = await this.getPickupLocationById(id);
    if (!existing) throw new Error('PICKUP_LOCATION_NOT_FOUND');

    const updatePayload: any = { updated_at: new Date() };
    if (data.name !== undefined) updatePayload.name = data.name.trim();
    if (data.address !== undefined) updatePayload.address = data.address.trim();
    if (data.neighborhood !== undefined) {
      updatePayload.neighborhood = data.neighborhood ? data.neighborhood.trim() : null;
    }
    if (data.active !== undefined) updatePayload.active = Boolean(data.active);

    const [updated] = await db
      .update(pickupLocations)
      .set(updatePayload)
      .where(eq(pickupLocations.id, id))
      .returning();

    return updated as PickupLocation;
  }

  // ==========================================
  // Route Operations (M2.1 Seção 5 - 18)
  // ==========================================

  /**
   * Parse DB route stop row to domain model
   */
  private parseRouteStopRow(row: any): RouteStop {
    return {
      id: row.id,
      route_id: row.route_id,
      sequence: row.sequence,
      destination_address: row.destination_address,
      destination_neighborhood: row.destination_neighborhood,
      cargo_description: row.cargo_description,
      delivery_mode: row.delivery_mode,
      observations: row.observations,
      desired_deadline: row.desired_deadline,
      status: row.status,
      pin_code: row.pin_code,
      delivered_at: row.delivered_at,
      proof_type: row.proof_type,
      proof_reference: row.proof_reference,
      incident_type: row.incident_type,
      incident_note: row.incident_note,
      incident_at: row.incident_at,
      incident_resolution_status: row.incident_resolution_status || (row.status === 'INCIDENT' ? 'OPEN' : null),
      resolution_type: row.resolution_type || null,
      resolution_note: row.resolution_note || null,
      resolved_at: row.resolved_at || null,
      resolved_by: row.resolved_by || null,
      // M4.2 Modality, Neighborhood, Pricing Category & Customer Freight
      modality_code: row.modality_code || 'CONVENCIONAL',
      neighborhood_id: row.neighborhood_id || null,
      pricing_vehicle_category: row.pricing_vehicle_category || null,
      customer_freight: row.customer_freight != null ? parseFloat(String(row.customer_freight)) : null,
      net_delivery_base: row.net_delivery_base != null ? parseFloat(String(row.net_delivery_base)) : null,
      management_amount: row.management_amount != null ? parseFloat(String(row.management_amount)) : null,
      created_at: row.created_at,
      completed_at: row.completed_at,
    };
  }

  /**
   * Parse DB route row to domain model
   */
  private parseRouteRow(row: any, stops?: RouteStop[]): Route {
    let acceptedVehicles: VehicleType[] = [];
    try {
      acceptedVehicles = typeof row.accepted_vehicle_types === 'string'
        ? JSON.parse(row.accepted_vehicle_types)
        : row.accepted_vehicle_types || [];
    } catch {
      acceptedVehicles = [];
    }

    return {
      id: row.id,
      pickup_type: row.pickup_type,
      pickup_location_id: row.pickup_location_id,
      pickup_name: row.pickup_name,
      pickup_address: row.pickup_address,
      pickup_neighborhood_snapshot: row.pickup_neighborhood_snapshot || null,
      final_deadline: row.final_deadline,
      total_fee: row.total_fee,
      accepted_vehicle_types: acceptedVehicles,
      status: row.status,
      accepted_driver_id: row.accepted_driver_id,
      accepted_at: row.accepted_at,
      arrived_pickup_at: row.arrived_pickup_at,
      picked_up_at: row.picked_up_at,
      started_at: row.started_at,
      completed_at: row.completed_at,
      payment_status: (row.payment_status as PaymentStatus) || 'PENDING',
      paid_at: row.paid_at,
      paid_by: row.paid_by,
      payment_method: row.payment_method || 'PIX',
      payment_reference: row.payment_reference,
      payment_note: row.payment_note,
      // M4.2 Financial Fields
      customer_freight_total: row.customer_freight_total != null ? parseFloat(String(row.customer_freight_total)) : null,
      management_rate_snapshot: row.management_rate_snapshot != null ? parseFloat(String(row.management_rate_snapshot)) : null,
      management_amount_total: row.management_amount_total != null ? parseFloat(String(row.management_amount_total)) : null,
      route_base_amount: row.route_base_amount != null ? parseFloat(String(row.route_base_amount)) : null,
      route_discount_percent_snapshot: row.route_discount_percent_snapshot != null ? parseFloat(String(row.route_discount_percent_snapshot)) : null,
      suggested_driver_fee: row.suggested_driver_fee != null ? parseFloat(String(row.suggested_driver_fee)) : null,
      final_driver_fee: row.final_driver_fee != null ? parseFloat(String(row.final_driver_fee)) : null,
      override_reason: row.override_reason || null,
      created_at: row.created_at,
      offered_at: row.offered_at,
      stops,
    };
  }

  /**
   * M4.2 Privacy Filter: Removes all internal financial and customer margins before returning to driver
   */
  public sanitizeRouteForDriver(route: Route): Route {
    const {
      customer_freight_total,
      management_rate_snapshot,
      management_amount_total,
      route_base_amount,
      route_discount_percent_snapshot,
      suggested_driver_fee,
      override_reason,
      ...driverSafeRoute
    } = route;

    if (driverSafeRoute.stops) {
      driverSafeRoute.stops = driverSafeRoute.stops.map((s) => {
        const {
          customer_freight,
          net_delivery_base,
          management_amount,
          ...driverSafeStop
        } = s;
        return driverSafeStop as RouteStop;
      });
    }

    return driverSafeRoute as Route;
  }

  /**
   * Create a route as DRAFT with 1..N stops
   * Never sends Telegram messages in DRAFT
   */
  public async createDraft(data: CreateRouteDTO, actor?: string): Promise<Route> {
    // Validations (Seção 24)
    if (!data.final_deadline?.trim()) {
      throw new Error('MISSING_FINAL_DEADLINE');
    }
    if (!Array.isArray(data.accepted_vehicle_types) || data.accepted_vehicle_types.length === 0) {
      throw new Error('AT_LEAST_ONE_VEHICLE_TYPE_REQUIRED');
    }
    if (!Array.isArray(data.stops) || data.stops.length === 0) {
      throw new Error('AT_LEAST_ONE_STOP_REQUIRED');
    }

    for (let i = 0; i < data.stops.length; i++) {
      const stop = data.stops[i];
      if (!stop.destination_address?.trim() || !stop.destination_neighborhood?.trim() || !stop.cargo_description?.trim()) {
        throw new Error(`MISSING_FIELDS_ON_STOP_${i + 1}`);
      }
    }

    // Resolve Pickup Details & Snapshot (Seção 13, 14, 15 + Bairro da Retirada)
    let pickupName = '';
    let pickupAddress = '';
    let pickupNeighborhoodSnapshot: string | null = null;
    let pickupLocationId: number | null = null;

    if (data.pickup_type === 'REGISTERED') {
      if (!data.pickup_location_id) {
        throw new Error('MISSING_PICKUP_LOCATION_ID');
      }
      const loc = await this.getPickupLocationById(data.pickup_location_id);
      if (!loc) {
        throw new Error('PICKUP_LOCATION_NOT_FOUND');
      }
      pickupLocationId = loc.id;
      pickupName = loc.name;
      pickupAddress = loc.address;
      pickupNeighborhoodSnapshot = loc.neighborhood?.trim() || null;
    } else {
      // AD_HOC
      if (!data.pickup_name?.trim() || !data.pickup_address?.trim()) {
        throw new Error('MISSING_AD_HOC_PICKUP_INFO');
      }
      pickupName = data.pickup_name.trim();
      pickupAddress = data.pickup_address.trim();
      const adHocNeighborhood = (data.pickup_neighborhood || data.pickup_neighborhood_snapshot)?.trim();
      pickupNeighborhoodSnapshot = adHocNeighborhood || null;
    }

    // ==========================================
    // M4.2 Precificação de Rota & Gestão Logística
    // ==========================================
    const config = await deliveryConfigService.getDeliveryConfig();
    const managementRate = data.management_rate_snapshot !== undefined
      ? data.management_rate_snapshot
      : config.logistics_management_rate;
    const discountPercent = data.route_discount_percent_snapshot !== undefined
      ? data.route_discount_percent_snapshot
      : config.default_route_discount_percent;

    // Calculate individual stop financial decompositions (Seção 21 & 22)
    const stopsCalc = data.stops.map((s) => {
      let customerFreight = 0;
      if (s.customer_freight !== undefined && s.customer_freight !== null && s.customer_freight !== '') {
        customerFreight = typeof s.customer_freight === 'number'
          ? s.customer_freight
          : parseFloat(String(s.customer_freight).replace(',', '.'));
      }
      customerFreight = Math.round((customerFreight || 0) * 100) / 100;

      let netBase = 0;
      let mgmtAmount = 0;
      if (customerFreight > 0) {
        netBase = Math.round((customerFreight / (1 + managementRate)) * 100) / 100;
        mgmtAmount = Math.round((customerFreight - netBase) * 100) / 100;
      }

      return {
        customer_freight: customerFreight,
        net_delivery_base: netBase,
        management_amount: mgmtAmount,
      };
    });

    const sumCustomerFreight = Math.round(stopsCalc.reduce((acc, s) => acc + s.customer_freight, 0) * 100) / 100;
    const sumMgmtAmount = Math.round(stopsCalc.reduce((acc, s) => acc + s.management_amount, 0) * 100) / 100;
    const sumBaseAmount = Math.round(stopsCalc.reduce((acc, s) => acc + s.net_delivery_base, 0) * 100) / 100;

    // Seção 26 & 27: Se 1 parada, suggested = base. Se >1 paradas, suggested = base * (1 - desconto)
    let calculatedSuggested = 0;
    if (data.stops.length > 1) {
      calculatedSuggested = Math.round(sumBaseAmount * (1 - discountPercent) * 100) / 100;
    } else {
      calculatedSuggested = sumBaseAmount;
    }

    const customerFreightTotal = data.customer_freight_total != null
      ? parseFloat(String(data.customer_freight_total).replace(',', '.'))
      : sumCustomerFreight;
    const managementAmountTotal = data.management_amount_total != null
      ? parseFloat(String(data.management_amount_total).replace(',', '.'))
      : sumMgmtAmount;
    const routeBaseAmount = data.route_base_amount != null
      ? parseFloat(String(data.route_base_amount).replace(',', '.'))
      : sumBaseAmount;
    const suggestedDriverFee = data.suggested_driver_fee != null
      ? parseFloat(String(data.suggested_driver_fee).replace(',', '.'))
      : calculatedSuggested;

    // Determinar valor final oferecido ao motorista
    let finalDriverFee = suggestedDriverFee;
    if (data.final_driver_fee != null && data.final_driver_fee !== '') {
      finalDriverFee = parseFloat(String(data.final_driver_fee).replace(',', '.'));
    } else if (data.total_fee?.trim()) {
      const parsed = parseFloat(data.total_fee.replace(',', '.'));
      if (!isNaN(parsed) && parsed > 0) {
        finalDriverFee = parsed;
      }
    }

    // Seção 28 & PRICE-T09: Se houver diferença entre sugerido e final, override_reason é obrigatório!
    if (
      customerFreightTotal > 0 &&
      Math.abs(finalDriverFee - suggestedDriverFee) > 0.009 &&
      !data.override_reason?.trim()
    ) {
      throw new Error('OVERRIDE_REASON_REQUIRED: O motivo do ajuste é obrigatório quando o frete final do motorista difere do sugerido');
    }

    // Formatar total_fee canônico para uso transparente nas APIs e bot
    const formattedTotalFee = finalDriverFee.toFixed(2).replace('.', ',');

    // Insert Route
    const [newRouteRow] = await db
      .insert(routes)
      .values({
        pickup_type: data.pickup_type,
        pickup_location_id: pickupLocationId,
        pickup_name: pickupName,
        pickup_address: pickupAddress,
        pickup_neighborhood_snapshot: pickupNeighborhoodSnapshot,
        final_deadline: data.final_deadline.trim(),
        total_fee: formattedTotalFee,
        accepted_vehicle_types: JSON.stringify(data.accepted_vehicle_types),
        status: 'DRAFT',
        // M4.2 Snapshots & Financeiro
        customer_freight_total: customerFreightTotal > 0 ? customerFreightTotal.toFixed(2) : null,
        management_rate_snapshot: managementRate.toFixed(4),
        management_amount_total: managementAmountTotal > 0 ? managementAmountTotal.toFixed(2) : null,
        route_base_amount: routeBaseAmount > 0 ? routeBaseAmount.toFixed(2) : null,
        route_discount_percent_snapshot: discountPercent.toFixed(4),
        suggested_driver_fee: suggestedDriverFee > 0 ? suggestedDriverFee.toFixed(2) : null,
        final_driver_fee: finalDriverFee > 0 ? finalDriverFee.toFixed(2) : null,
        override_reason: data.override_reason?.trim() || null,
      })
      .returning();

    // Insert Stops with explicit sequence and unique PIN per stop (M4 Seção 14 + M4.2)
    const insertedStops: RouteStop[] = [];
    const usedPins = new Set<string>();

    for (let i = 0; i < data.stops.length; i++) {
      const s = data.stops[i];

      // Generate unique 4-digit numeric PIN for each stop
      let pin = String(Math.floor(1000 + Math.random() * 9000));
      while (usedPins.has(pin)) {
        pin = String(Math.floor(1000 + Math.random() * 9000));
      }
      usedPins.add(pin);

      const [newStop] = await db
        .insert(routeStops)
        .values({
          route_id: newRouteRow.id,
          sequence: i + 1,
          destination_address: s.destination_address.trim(),
          destination_neighborhood: s.destination_neighborhood.trim(),
          cargo_description: s.cargo_description.trim(),
          delivery_mode: s.delivery_mode === 'NO_CONTACT' ? 'NO_CONTACT' : 'IN_PERSON',
          observations: s.observations?.trim() || null,
          desired_deadline: s.desired_deadline?.trim() || null,
          status: 'PENDING',
          pin_code: pin,
          // M4.2 Modality, Neighborhood, Pricing Category & Customer Freight
          modality_code: s.modality_code?.trim().toUpperCase() || 'CONVENCIONAL',
          neighborhood_id: s.neighborhood_id || null,
          pricing_vehicle_category: s.pricing_vehicle_category || null,
          customer_freight: stopsCalc[i].customer_freight > 0 ? stopsCalc[i].customer_freight.toFixed(2) : null,
          net_delivery_base: stopsCalc[i].net_delivery_base > 0 ? stopsCalc[i].net_delivery_base.toFixed(2) : null,
          management_amount: stopsCalc[i].management_amount > 0 ? stopsCalc[i].management_amount.toFixed(2) : null,
        })
        .returning();

      insertedStops.push(this.parseRouteStopRow(newStop));
    }

    // Log Audit
    await db.insert(routeEvents).values({
      route_id: newRouteRow.id,
      event_type: 'ROUTE_CREATED',
      actor: actor || 'ADMIN',
      details: `Created with ${insertedStops.length} stop(s). Final driver fee: R$ ${formattedTotalFee}. Pickup: ${pickupName}`,
    });

    return this.parseRouteRow(newRouteRow, insertedStops);
  }

  public async getRouteById(id: number): Promise<Route | null> {
    const rows = await db.select().from(routes).where(eq(routes.id, id));
    if (rows.length === 0) return null;

    const stopsRows = await db
      .select()
      .from(routeStops)
      .where(eq(routeStops.route_id, id))
      .orderBy(asc(routeStops.sequence));

    return this.parseRouteRow(rows[0], stopsRows.map((s) => this.parseRouteStopRow(s)));
  }

  public async getRoutes(status?: RouteStatus): Promise<Route[]> {
    let query = db.select().from(routes);
    if (status) {
      query = query.where(eq(routes.status, status)) as any;
    }
    const rows = await query.orderBy(desc(routes.id));

    // Fetch all stops for these routes
    const allStops = await db.select().from(routeStops).orderBy(asc(routeStops.sequence));
    const stopsByRouteId = new Map<number, RouteStop[]>();
    for (const stop of allStops) {
      const list = stopsByRouteId.get(stop.route_id) || [];
      list.push(stop as RouteStop);
      stopsByRouteId.set(stop.route_id, list);
    }

    return rows.map((r) => this.parseRouteRow(r, stopsByRouteId.get(r.id) || []));
  }

  public async getRouteDetails(id: number): Promise<{
    route: Route;
    dispatches: RouteOfferDispatch[];
    events: RouteEvent[];
    stats: { sent: number; failed: number };
  }> {
    const route = await this.getRouteById(id);
    if (!route) throw new Error('ROUTE_NOT_FOUND');

    const dispatchesRows = await db
      .select()
      .from(routeOfferDispatches)
      .where(eq(routeOfferDispatches.route_id, id));

    const eventsRows = await db
      .select()
      .from(routeEvents)
      .where(eq(routeEvents.route_id, id))
      .orderBy(desc(routeEvents.timestamp));

    const sent = dispatchesRows.filter((d) => d.status === 'SENT').length;
    const failed = dispatchesRows.filter((d) => d.status === 'FAILED').length;

    return {
      route,
      dispatches: dispatchesRows as RouteOfferDispatch[],
      events: eventsRows as RouteEvent[],
      stats: { sent, failed },
    };
  }

  /**
   * Publish Route: DRAFT -> OFFERED
   * Filters eligible drivers by ACTIVE status AND vehicle compatibility.
   */
  public async publishRoute(
    id: number,
    actor?: string,
    options?: { pickup_neighborhood?: string }
  ): Promise<{
    route: Route;
    dispatches: RouteOfferDispatch[];
    stats: { sent: number; failed: number };
  }> {
    const route = await this.getRouteById(id);
    if (!route) throw new Error('ROUTE_NOT_FOUND');

    if (route.status === 'OFFERED') {
      throw new Error('ROUTE_ALREADY_OFFERED');
    }
    if (route.status === 'CANCELLED') {
      throw new Error('CANNOT_PUBLISH_CANCELLED_ROUTE');
    }
    if (route.status === 'ACCEPTED') {
      throw new Error('CANNOT_PUBLISH_ACCEPTED_ROUTE');
    }

    // Validação Obrigatória do Bairro da Retirada (Regra Obrigatória & PICKUP-N05)
    let currentPickupNeighborhood = route.pickup_neighborhood_snapshot?.trim();
    if (options?.pickup_neighborhood?.trim()) {
      currentPickupNeighborhood = options.pickup_neighborhood.trim();
      await db
        .update(routes)
        .set({ pickup_neighborhood_snapshot: currentPickupNeighborhood })
        .where(eq(routes.id, id));
      route.pickup_neighborhood_snapshot = currentPickupNeighborhood;
    }

    if (!currentPickupNeighborhood) {
      if (route.pickup_type === 'REGISTERED' && route.pickup_location_id) {
        const loc = await this.getPickupLocationById(route.pickup_location_id);
        if (loc?.neighborhood?.trim()) {
          currentPickupNeighborhood = loc.neighborhood.trim();
          await db
            .update(routes)
            .set({ pickup_neighborhood_snapshot: currentPickupNeighborhood })
            .where(eq(routes.id, id));
          route.pickup_neighborhood_snapshot = currentPickupNeighborhood;
        } else {
          throw new Error('NEIGHBORHOOD_REQUIRED_FOR_PUBLICATION: O ponto de coleta cadastrado não possui bairro cadastrado. Complemente o cadastro do ponto com o bairro antes de publicar a rota.');
        }
      } else {
        throw new Error('NEIGHBORHOOD_REQUIRED_FOR_PUBLICATION: O bairro da retirada é obrigatório para publicar a rota. Preencha o bairro da coleta.');
      }
    }

    // Vehicle & Driver Eligibility Check (Seção 19 & 20)
    const allDrivers = await driverService.getDrivers();
    const eligibleDrivers = allDrivers.filter((driver) => canReceiveRouteOffer(driver, route));

    if (eligibleDrivers.length === 0) {
      throw new Error('NO_ACTIVE_DRIVERS_AVAILABLE');
    }

    // Transition Route to OFFERED
    const [updatedRow] = await db
      .update(routes)
      .set({
        status: 'OFFERED',
        offered_at: new Date(),
      })
      .where(eq(routes.id, id))
      .returning();

    // Log audit event
    await db.insert(routeEvents).values({
      route_id: id,
      event_type: 'ROUTE_OFFERED',
      actor: actor || 'ADMIN',
      details: `Dispatched to ${eligibleDrivers.length} eligible driver(s)`,
    });

    const recordedDispatches: RouteOfferDispatch[] = [];
    let sentCount = 0;
    let failedCount = 0;

    const freshRoute = await this.getRouteById(id);
    if (!freshRoute) throw new Error('ROUTE_NOT_FOUND_AFTER_UPDATE');

    // Distribute to each eligible driver individually
    for (const driver of eligibleDrivers) {
      try {
        const sendResult = await telegramBot.sendRouteOffer(
          driver.telegram_chat_id,
          freshRoute,
          driver.vehicle_type
        );

        const dispatchStatus = sendResult.success ? 'SENT' : 'FAILED';
        if (dispatchStatus === 'SENT') {
          sentCount++;
        } else {
          failedCount++;
        }

        const [disp] = await db
          .insert(routeOfferDispatches)
          .values({
            route_id: id,
            driver_id: driver.id,
            telegram_chat_id: driver.telegram_chat_id,
            telegram_message_id: sendResult.messageId || null,
            status: dispatchStatus,
            error_code: sendResult.errorCode || null,
          })
          .returning();

        recordedDispatches.push(disp as RouteOfferDispatch);
      } catch (err: any) {
        failedCount++;
        try {
          const [disp] = await db
            .insert(routeOfferDispatches)
            .values({
              route_id: id,
              driver_id: driver.id,
              telegram_chat_id: driver.telegram_chat_id,
              status: 'FAILED',
              error_code: err.message || 'DISPATCH_EXCEPTION',
            })
            .returning();
          recordedDispatches.push(disp as RouteOfferDispatch);
        } catch {
          // unique constraint caught duplicate
        }
      }
    }

    return {
      route: freshRoute,
      dispatches: recordedDispatches,
      stats: { sent: sentCount, failed: failedCount },
    };
  }

  /**
   * Cancel Route: DRAFT -> CANCELLED or OFFERED -> CANCELLED
   * ACCEPTED routes cannot be cancelled.
   * If OFFERED, notifies all drivers who received SENT offer.
   */
  public async cancelRoute(id: number, actor?: string): Promise<Route> {
    const route = await this.getRouteById(id);
    if (!route) throw new Error('ROUTE_NOT_FOUND');

    if (route.status === 'CANCELLED') {
      throw new Error('ROUTE_ALREADY_CANCELLED');
    }
    if (route.status === 'ACCEPTED') {
      throw new Error('CANNOT_CANCEL_ACCEPTED_ROUTE');
    }

    const previousStatus = route.status;

    const [updatedRow] = await db
      .update(routes)
      .set({ status: 'CANCELLED' })
      .where(eq(routes.id, id))
      .returning();

    // Log audit event
    await db.insert(routeEvents).values({
      route_id: id,
      event_type: 'ROUTE_CANCELLED',
      actor: actor || 'ADMIN',
    });

    // Notify drivers if it was OFFERED
    if (previousStatus === 'OFFERED') {
      const dispatches = await db
        .select()
        .from(routeOfferDispatches)
        .where(eq(routeOfferDispatches.route_id, id));

      for (const disp of dispatches) {
        if (disp.status === 'SENT') {
          await telegramBot.sendRouteCancellation(disp.telegram_chat_id, id).catch((e) => {
            console.error(`[RouteService] Cancellation notify failed for chat ${disp.telegram_chat_id}:`, e.message);
          });
        }
      }
    }

    const updatedRoute = await this.getRouteById(id);
    return updatedRoute!;
  }

  /**
   * M3 & M2.1: Exclusive and Atomic Route Acceptance
   * Guarantees at most ONE winning driver per route even under extreme concurrency.
   * Atomic decision enforced directly in PostgreSQL without in-memory locks.
   * Re-evaluates vehicle compatibility at acceptance moment (Seção 21 & 22).
   */
  public async acceptRoute(
    routeId: number,
    identifier: { telegramUserId?: string; driverId?: number }
  ): Promise<AcceptRouteResult> {
    // 1. Resolve Driver
    let driver = null;
    if (identifier.telegramUserId) {
      driver = await driverService.getDriverByTelegramUserId(identifier.telegramUserId);
    } else if (identifier.driverId) {
      driver = await driverService.getDriverById(identifier.driverId);
    }

    if (!driver) {
      return {
        status: 'REJECTED',
        error: 'DRIVER_NOT_FOUND',
        message: 'Motorista não encontrado.',
      };
    }

    // 2. Validate Driver Status
    if (driver.status === 'PENDING') {
      return {
        status: 'REJECTED',
        error: 'DRIVER_PENDING',
        message: 'Seu cadastro está aguardando aprovação.',
      };
    }
    if (driver.status === 'BLOCKED') {
      return {
        status: 'REJECTED',
        error: 'DRIVER_BLOCKED',
        message: 'Seu cadastro não está ativo no momento.',
      };
    }
    if (driver.status !== 'ACTIVE') {
      return {
        status: 'REJECTED',
        error: 'DRIVER_NOT_ACTIVE',
        message: 'Motorista não está ativo.',
      };
    }

    // 3. Validate Route Exists
    const route = await this.getRouteById(routeId);
    if (!route) {
      return {
        status: 'REJECTED',
        error: 'ROUTE_NOT_FOUND',
        message: 'Rota não encontrada.',
      };
    }

    // 4. Validate Vehicle Compatibility at Acceptance Time (Seção 21 & 22)
    if (!route.accepted_vehicle_types.includes(driver.vehicle_type)) {
      return {
        status: 'REJECTED',
        error: 'VEHICLE_INCOMPATIBLE',
        message: 'Seu veículo atual não é compatível com esta rota.',
      };
    }

    // 5. Validate Route is not CANCELLED
    if (route.status === 'CANCELLED') {
      return {
        status: 'REJECTED',
        error: 'ROUTE_CANCELLED',
        message: 'Esta rota foi cancelada.',
      };
    }

    // 6. Validate Dispatch: Driver MUST have received this offer with status SENT
    const dispatches = await db
      .select()
      .from(routeOfferDispatches)
      .where(
        and(
          eq(routeOfferDispatches.route_id, routeId),
          eq(routeOfferDispatches.driver_id, driver.id)
        )
      );

    const sentDispatch = dispatches.find((d) => d.status === 'SENT');
    if (!sentDispatch) {
      return {
        status: 'REJECTED',
        error: 'NO_SENT_DISPATCH',
        message: 'Você não recebeu a oferta para esta rota.',
      };
    }

    // 7. Idempotency Check: Did this driver ALREADY win this route?
    if (route.status === 'ACCEPTED' && route.accepted_driver_id === driver.id) {
      return {
        status: 'ALREADY_WON',
        route,
        message: 'Esta rota já está confirmada para você.',
      };
    }

    // 8. Check if already accepted by another driver
    if (route.status === 'ACCEPTED' && route.accepted_driver_id !== driver.id) {
      return {
        status: 'LOST',
        message: 'Esta rota já foi aceita por outro motorista.',
      };
    }

    // 9. Route must be OFFERED
    if (route.status !== 'OFFERED') {
      return {
        status: 'REJECTED',
        error: 'ROUTE_NOT_OFFERED',
        message: 'Esta rota não está disponível para aceite.',
      };
    }

    // 10. CRITICAL: ATOMIC ACCEPTANCE IN POSTGRESQL
    // PostgreSQL enforces exclusive row lock on the single target route row.
    // Exactly ONE concurrent transaction will successfully update status OFFERED -> ACCEPTED.
    const updateResults = await db
      .update(routes)
      .set({
        status: 'ACCEPTED',
        accepted_driver_id: driver.id,
        accepted_at: sql`NOW()`,
      })
      .where(
        and(
          eq(routes.id, routeId),
          eq(routes.status, 'OFFERED')
        )
      )
      .returning();

    if (updateResults.length > 0) {
      // 1 line returned: THIS DRIVER IS THE EXCLUSIVE WINNER
      const wonRoute = await this.getRouteById(routeId);

      // Record exactly ONE ROUTE_ACCEPTED audit event
      await db.insert(routeEvents).values({
        route_id: routeId,
        event_type: 'ROUTE_ACCEPTED',
        actor: `DRIVER #${driver.id}`,
        details: `Accepted by ${driver.name} (Vehicle: ${driver.vehicle_type})`,
      });

      // Invalidate offer markup for all other drivers who received the offer
      this.invalidateOtherOffers(routeId, driver.id).catch((err) => {
        console.warn('[RouteService] Invalidate other offers error:', err.message);
      });

      return {
        status: 'WON',
        route: wonRoute || undefined,
        message: 'Rota aceita com sucesso.',
      };
    }

    // 0 lines returned: Another concurrent transaction already won or route changed state
    const freshRoute = await this.getRouteById(routeId);
    if (freshRoute?.status === 'ACCEPTED' && freshRoute.accepted_driver_id === driver.id) {
      return {
        status: 'ALREADY_WON',
        route: freshRoute,
        message: 'Esta rota já está confirmada para você.',
      };
    }

    if (freshRoute?.status === 'ACCEPTED') {
      return {
        status: 'LOST',
        message: 'Esta rota já foi aceita por outro motorista.',
      };
    }

    return {
      status: 'REJECTED',
      error: 'ROUTE_UNAVAILABLE',
      message: 'Esta rota não está mais disponível.',
    };
  }

  /**
   * Invalidate or update offer button on other drivers' messages after route is accepted
   */
  private async invalidateOtherOffers(routeId: number, winningDriverId: number) {
    try {
      const otherDispatches = await db
        .select()
        .from(routeOfferDispatches)
        .where(
          and(
            eq(routeOfferDispatches.route_id, routeId),
            eq(routeOfferDispatches.status, 'SENT')
          )
        );

      for (const disp of otherDispatches) {
        if (disp.driver_id !== winningDriverId && disp.telegram_message_id) {
          await telegramBot.invalidateRouteOfferMarkup(disp.telegram_chat_id, disp.telegram_message_id).catch(() => {});
        }
      }
    } catch (err: any) {
      console.warn('[RouteService.invalidateOtherOffers] Error:', err.message);
    }
  }

  // ==========================================
  // M4: EXECUÇÃO OPERACIONAL DA ROTA & PARADAS
  // ==========================================

  /**
   * Resolve and validate driver from driverId or telegramUserId
   */
  public async resolveDriver(identifier: { driverId?: number; telegramUserId?: string }): Promise<Driver> {
    if (identifier.driverId) {
      const drv = await driverService.getDriverById(identifier.driverId);
      if (!drv) throw new Error('DRIVER_NOT_FOUND');
      return drv;
    }
    if (identifier.telegramUserId) {
      const drv = await driverService.getDriverByTelegramUserId(identifier.telegramUserId);
      if (!drv) throw new Error('DRIVER_NOT_REGISTERED');
      return drv;
    }
    throw new Error('MISSING_DRIVER_IDENTIFIER');
  }

  /**
   * Get single stop by ID
   */
  public async getStopById(stopId: number): Promise<RouteStop | null> {
    const rows = await db.select().from(routeStops).where(eq(routeStops.id, stopId));
    if (rows.length === 0) return null;
    return this.parseRouteStopRow(rows[0]);
  }

  /**
   * Get next pending stop for a route, ordered by sequence
   */
  public async getNextPendingStop(routeId: number): Promise<RouteStop | null> {
    const rows = await db
      .select()
      .from(routeStops)
      .where(and(eq(routeStops.route_id, routeId), eq(routeStops.status, 'PENDING')))
      .orderBy(asc(routeStops.sequence));
    if (rows.length === 0) return null;
    return this.parseRouteStopRow(rows[0]);
  }

  /**
   * M4 Seção 8: CHEGUEI PARA COLETA
   * Transition: ACCEPTED -> ARRIVED_PICKUP
   */
  public async markArrivedPickup(
    routeId: number,
    identifier: { driverId?: number; telegramUserId?: string }
  ): Promise<Route> {
    const driver = await this.resolveDriver(identifier);
    const route = await this.getRouteById(routeId);
    if (!route) throw new Error('ROUTE_NOT_FOUND');

    // M4 Seção 28: Somente o motorista vencedor pode executar
    if (route.accepted_driver_id !== driver.id) {
      throw new Error('UNAUTHORIZED_DRIVER: Motorista não é o vencedor desta rota');
    }

    // Idempotência (M4 Seção 30)
    if (route.status === 'ARRIVED_PICKUP') {
      return route;
    }

    // Validação estrita da máquina de estados (M4 Seção 5)
    if (route.status !== 'ACCEPTED') {
      throw new Error(`INVALID_STATUS_TRANSITION: Status atual '${route.status}', esperado 'ACCEPTED'`);
    }

    const now = new Date();
    await db
      .update(routes)
      .set({
        status: 'ARRIVED_PICKUP',
        arrived_pickup_at: now,
      })
      .where(eq(routes.id, routeId));

    await db.insert(routeEvents).values({
      route_id: routeId,
      event_type: 'ROUTE_ARRIVED_PICKUP',
      actor: `DRIVER #${driver.id}`,
      details: `Driver ${driver.name} arrived at pickup point ${route.pickup_name}`,
    });

    const updated = await this.getRouteById(routeId);
    return updated!;
  }

  /**
   * M4 Seção 9: PEDIDOS COLETADOS
   * Transition: ARRIVED_PICKUP -> PICKED_UP
   */
  public async markPickedUp(
    routeId: number,
    identifier: { driverId?: number; telegramUserId?: string }
  ): Promise<Route> {
    const driver = await this.resolveDriver(identifier);
    const route = await this.getRouteById(routeId);
    if (!route) throw new Error('ROUTE_NOT_FOUND');

    if (route.accepted_driver_id !== driver.id) {
      throw new Error('UNAUTHORIZED_DRIVER: Motorista não é o vencedor desta rota');
    }

    // Idempotência
    if (route.status === 'PICKED_UP') {
      return route;
    }

    // Validação estrita
    if (route.status !== 'ARRIVED_PICKUP') {
      throw new Error(`INVALID_STATUS_TRANSITION: Status atual '${route.status}', esperado 'ARRIVED_PICKUP'`);
    }

    const now = new Date();
    await db
      .update(routes)
      .set({
        status: 'PICKED_UP',
        picked_up_at: now,
      })
      .where(eq(routes.id, routeId));

    await db.insert(routeEvents).values({
      route_id: routeId,
      event_type: 'ROUTE_PICKED_UP',
      actor: `DRIVER #${driver.id}`,
      details: `Orders collected by driver ${driver.name} (${route.stops?.length || 0} stops loaded)`,
    });

    const updated = await this.getRouteById(routeId);
    return updated!;
  }

  /**
   * M4 Seção 10: INICIAR ROTA
   * Transition: PICKED_UP -> IN_TRANSIT
   */
  public async startRoute(
    routeId: number,
    identifier: { driverId?: number; telegramUserId?: string }
  ): Promise<{ route: Route; nextStop: RouteStop | null }> {
    const driver = await this.resolveDriver(identifier);
    const route = await this.getRouteById(routeId);
    if (!route) throw new Error('ROUTE_NOT_FOUND');

    if (route.accepted_driver_id !== driver.id) {
      throw new Error('UNAUTHORIZED_DRIVER: Motorista não é o vencedor desta rota');
    }

    // Idempotência
    if (route.status === 'IN_TRANSIT') {
      const nextStop = await this.getNextPendingStop(routeId);
      return { route, nextStop };
    }

    // Validação estrita
    if (route.status !== 'PICKED_UP') {
      throw new Error(`INVALID_STATUS_TRANSITION: Status atual '${route.status}', esperado 'PICKED_UP'`);
    }

    const now = new Date();
    await db
      .update(routes)
      .set({
        status: 'IN_TRANSIT',
        started_at: now,
      })
      .where(eq(routes.id, routeId));

    await db.insert(routeEvents).values({
      route_id: routeId,
      event_type: 'ROUTE_STARTED',
      actor: `DRIVER #${driver.id}`,
      details: `Route started by driver ${driver.name}`,
    });

    const updated = (await this.getRouteById(routeId))!;
    const nextStop = await this.getNextPendingStop(routeId);
    return { route: updated, nextStop };
  }

  /**
   * Check if all stops in route are terminal (DELIVERED or INCIDENT) and auto-complete route
   * (M4 Seção 23 & 24)
   */
  private async checkAndCompleteRouteIfTerminal(routeId: number): Promise<{
    routeCompleted: boolean;
    remainingCount: number;
    completedAt?: Date;
  }> {
    const allStops = await db
      .select()
      .from(routeStops)
      .where(eq(routeStops.route_id, routeId));

    const pendingStops = allStops.filter((s) => s.status === 'PENDING');
    const remainingCount = pendingStops.length;

    if (remainingCount === 0 && allStops.length > 0) {
      // All stops are in terminal state (DELIVERED or INCIDENT)
      const now = new Date();
      await db
        .update(routes)
        .set({
          status: 'COMPLETED',
          completed_at: now,
        })
        .where(eq(routes.id, routeId));

      await db.insert(routeEvents).values({
        route_id: routeId,
        event_type: 'ROUTE_COMPLETED',
        actor: 'SYSTEM',
        details: `Route completed automatically. All ${allStops.length} stops reached terminal status.`,
      });

      return { routeCompleted: true, remainingCount: 0, completedAt: now };
    }

    return { routeCompleted: false, remainingCount };
  }

  /**
   * M4 Seção 13, 14, 15, 16: ENTREGA PRESENCIAL — PIN
   * Validate STOP PIN and conclude STOP
   */
  public async deliverStopWithPin(
    stopId: number,
    pin: string,
    identifier: { driverId?: number; telegramUserId?: string }
  ): Promise<{
    success: boolean;
    stop?: RouteStop;
    routeCompleted?: boolean;
    remainingCount?: number;
    nextStop?: RouteStop | null;
    error?: string;
    message: string;
  }> {
    const driver = await this.resolveDriver(identifier);
    const stop = await this.getStopById(stopId);
    if (!stop) throw new Error('STOP_NOT_FOUND');

    const route = await this.getRouteById(stop.route_id);
    if (!route) throw new Error('ROUTE_NOT_FOUND');

    if (route.accepted_driver_id !== driver.id) {
      throw new Error('UNAUTHORIZED_DRIVER: Motorista não é o vencedor desta rota');
    }

    if (route.status !== 'IN_TRANSIT') {
      throw new Error(`INVALID_STATUS_TRANSITION: Rota não está em trânsito (status atual: ${route.status})`);
    }

    // Idempotência
    if (stop.status === 'DELIVERED') {
      const remainingCount = (route.stops || []).filter((s) => s.status === 'PENDING').length;
      return {
        success: true,
        stop,
        routeCompleted: (route.status as string) === 'COMPLETED',
        remainingCount,
        message: 'Esta entrega já foi confirmada anteriormente.',
      };
    }

    if (stop.status !== 'PENDING') {
      throw new Error(`CANNOT_DELIVER_STOP_IN_STATUS_${stop.status}`);
    }

    if (stop.delivery_mode !== 'IN_PERSON') {
      throw new Error('INVALID_DELIVERY_MODE: Esta parada requer comprovante por foto');
    }

    // Validação do PIN (M4 Seção 15 & 16)
    const normalizedInputPin = (pin || '').trim();
    if (!stop.pin_code || normalizedInputPin !== stop.pin_code.trim()) {
      return {
        success: false,
        error: 'INVALID_PIN',
        message: '❌ PIN incorreto.\nConfira com o cliente e tente novamente.',
      };
    }

    // PIN Correto -> PENDING -> DELIVERED
    const now = new Date();
    await db
      .update(routeStops)
      .set({
        status: 'DELIVERED',
        delivered_at: now,
        completed_at: now,
        proof_type: 'PIN',
      })
      .where(eq(routeStops.id, stopId));

    await db.insert(routeEvents).values({
      route_id: route.id,
      event_type: 'STOP_DELIVERED',
      actor: `DRIVER #${driver.id}`,
      details: `Stop #${stop.sequence} delivered (PIN validated)`,
    });

    const updatedStop = (await this.getStopById(stopId))!;
    const completion = await this.checkAndCompleteRouteIfTerminal(route.id);
    const nextStop = completion.routeCompleted ? null : await this.getNextPendingStop(route.id);

    return {
      success: true,
      stop: updatedStop,
      routeCompleted: completion.routeCompleted,
      remainingCount: completion.remainingCount,
      nextStop,
      message: 'Entrega confirmada com sucesso via PIN.',
    };
  }

  /**
   * M4 Seção 17, 18: ENTREGA SEM CONTATO — FOTO
   * Validate photo evidence and conclude STOP
   */
  public async deliverStopWithPhoto(
    stopId: number,
    proofReference: string,
    identifier: { driverId?: number; telegramUserId?: string }
  ): Promise<{
    success: boolean;
    stop?: RouteStop;
    routeCompleted?: boolean;
    remainingCount?: number;
    nextStop?: RouteStop | null;
    message: string;
  }> {
    const driver = await this.resolveDriver(identifier);
    const stop = await this.getStopById(stopId);
    if (!stop) throw new Error('STOP_NOT_FOUND');

    const route = await this.getRouteById(stop.route_id);
    if (!route) throw new Error('ROUTE_NOT_FOUND');

    if (route.accepted_driver_id !== driver.id) {
      throw new Error('UNAUTHORIZED_DRIVER: Motorista não é o vencedor desta rota');
    }

    if (route.status !== 'IN_TRANSIT') {
      throw new Error(`INVALID_STATUS_TRANSITION: Rota não está em trânsito (status atual: ${route.status})`);
    }

    // Idempotência
    if (stop.status === 'DELIVERED') {
      const remainingCount = (route.stops || []).filter((s) => s.status === 'PENDING').length;
      return {
        success: true,
        stop,
        routeCompleted: (route.status as string) === 'COMPLETED',
        remainingCount,
        message: 'Esta entrega já foi confirmada anteriormente.',
      };
    }

    if (stop.status !== 'PENDING') {
      throw new Error(`CANNOT_DELIVER_STOP_IN_STATUS_${stop.status}`);
    }

    if (stop.delivery_mode !== 'NO_CONTACT') {
      throw new Error('INVALID_DELIVERY_MODE: Esta parada requer confirmação por PIN presencial');
    }

    const ref = (proofReference || '').trim();
    if (!ref) {
      throw new Error('MISSING_PHOTO_PROOF: Nenhuma foto de comprovante informada');
    }

    // M4 Seção 18 / M4-T10: Não usar uma foto para concluir múltiplas stops
    const existingUsage = await db
      .select()
      .from(routeStops)
      .where(and(eq(routeStops.proof_reference, ref), eq(routeStops.status, 'DELIVERED')));

    if (existingUsage.length > 0 && existingUsage[0].id !== stopId) {
      throw new Error('PHOTO_ALREADY_USED: Esta foto já foi utilizada para comprovar outra parada');
    }

    const now = new Date();
    await db
      .update(routeStops)
      .set({
        status: 'DELIVERED',
        delivered_at: now,
        completed_at: now,
        proof_type: 'PHOTO',
        proof_reference: ref,
      })
      .where(eq(routeStops.id, stopId));

    await db.insert(routeEvents).values({
      route_id: route.id,
      event_type: 'STOP_DELIVERED',
      actor: `DRIVER #${driver.id}`,
      details: `Stop #${stop.sequence} delivered (Photo proof attached)`,
    });

    const updatedStop = (await this.getStopById(stopId))!;
    const completion = await this.checkAndCompleteRouteIfTerminal(route.id);
    const nextStop = completion.routeCompleted ? null : await this.getNextPendingStop(route.id);

    return {
      success: true,
      stop: updatedStop,
      routeCompleted: completion.routeCompleted,
      remainingCount: completion.remainingCount,
      nextStop,
      message: 'Entrega sem contato confirmada com sucesso via foto.',
    };
  }

  /**
   * M4 Seção 20, 21: REGISTRO DE INCIDENTE NA PARADA
   * Transition: PENDING -> INCIDENT
   */
  public async reportStopIncident(
    stopId: number,
    data: { incident_type: IncidentType | string; incident_note?: string },
    identifier: { driverId?: number; telegramUserId?: string }
  ): Promise<{
    success: boolean;
    stop?: RouteStop;
    routeCompleted?: boolean;
    remainingCount?: number;
    nextStop?: RouteStop | null;
    message: string;
  }> {
    const driver = await this.resolveDriver(identifier);
    const stop = await this.getStopById(stopId);
    if (!stop) throw new Error('STOP_NOT_FOUND');

    const route = await this.getRouteById(stop.route_id);
    if (!route) throw new Error('ROUTE_NOT_FOUND');

    if (route.accepted_driver_id !== driver.id) {
      throw new Error('UNAUTHORIZED_DRIVER: Motorista não é o vencedor desta rota');
    }

    if (route.status !== 'IN_TRANSIT') {
      throw new Error(`INVALID_STATUS_TRANSITION: Rota não está em trânsito (status atual: ${route.status})`);
    }

    // Não pode registrar incidente após DELIVERED (M4 Seção 29)
    if (stop.status === 'DELIVERED') {
      throw new Error('CANNOT_REPORT_INCIDENT_ON_DELIVERED_STOP');
    }

    // Idempotência
    if (stop.status === 'INCIDENT') {
      const remainingCount = (route.stops || []).filter((s) => s.status === 'PENDING').length;
      return {
        success: true,
        stop,
        routeCompleted: (route.status as string) === 'COMPLETED',
        remainingCount,
        message: 'Incidente já registrado para esta parada.',
      };
    }

    if (stop.status !== 'PENDING') {
      throw new Error(`CANNOT_REPORT_INCIDENT_IN_STATUS_${stop.status}`);
    }

    const now = new Date();
    await db
      .update(routeStops)
      .set({
        status: 'INCIDENT',
        incident_type: data.incident_type,
        incident_note: data.incident_note?.trim() || null,
        incident_at: now,
        completed_at: now,
        incident_resolution_status: 'OPEN', // M4.1 Parte B: automaticamente OPEN ao virar INCIDENT
      })
      .where(eq(routeStops.id, stopId));

    await db.insert(routeEvents).values({
      route_id: route.id,
      event_type: 'STOP_INCIDENT',
      actor: `DRIVER #${driver.id}`,
      details: `Stop #${stop.sequence} incident: ${data.incident_type}${
        data.incident_note ? ' - ' + data.incident_note : ''
      }`,
    });

    const updatedStop = (await this.getStopById(stopId))!;
    const completion = await this.checkAndCompleteRouteIfTerminal(route.id);
    const nextStop = completion.routeCompleted ? null : await this.getNextPendingStop(route.id);

    return {
      success: true,
      stop: updatedStop,
      routeCompleted: completion.routeCompleted,
      remainingCount: completion.remainingCount,
      nextStop,
      message: 'Incidente registrado com sucesso.',
    };
  }

  // ==========================================
  // M4.1 PARTE B: Gestão de Incidentes (⚠️ PENDÊNCIAS)
  // ==========================================

  /**
   * Resolução operacional de incidente na parada
   * Registra resolution_type, resolution_note, resolved_at, resolved_by
   * e incident_resolution_status = 'RESOLVED'
   * Preserva incidente original (o que falhou e como foi resolvido)
   */
  public async resolveStopIncident(
    stopId: number,
    data: {
      resolution_type: IncidentResolutionType;
      resolution_note?: string;
      resolved_by: string;
    }
  ): Promise<RouteStop> {
    const validResolutionTypes: IncidentResolutionType[] = [
      'RETURN_TO_ORIGIN',
      'DELIVERED_LATER',
      'DELIVERED_TO_ALTERNATIVE_LOCATION',
      'CUSTOMER_PICKUP',
      'DISCARDED',
      'OTHER',
    ];

    if (!validResolutionTypes.includes(data.resolution_type)) {
      throw new Error(`INVALID_RESOLUTION_TYPE: ${data.resolution_type}`);
    }

    const stop = await this.getStopById(stopId);
    if (!stop) throw new Error('STOP_NOT_FOUND');

    if (stop.status !== 'INCIDENT') {
      throw new Error(`STOP_IS_NOT_AN_INCIDENT: Status atual '${stop.status}', esperado 'INCIDENT'`);
    }

    const now = new Date();
    await db
      .update(routeStops)
      .set({
        incident_resolution_status: 'RESOLVED',
        resolution_type: data.resolution_type,
        resolution_note: data.resolution_note?.trim() || null,
        resolved_at: now,
        resolved_by: data.resolved_by,
      })
      .where(eq(routeStops.id, stopId));

    await db.insert(routeEvents).values({
      route_id: stop.route_id,
      event_type: 'STOP_INCIDENT_RESOLVED',
      actor: data.resolved_by,
      details: `Stop #${stop.sequence} incident resolved as ${data.resolution_type}${
        data.resolution_note ? ' - ' + data.resolution_note : ''
      }`,
    });

    const updated = await this.getStopById(stopId);
    return updated!;
  }

  /**
   * Listar incidentes operacionais para a seção ⚠️ PENDÊNCIAS
   */
  public async getIncidents(filters?: {
    resolution_status?: 'OPEN' | 'RESOLVED' | 'ALL';
    search?: string;
  }): Promise<{
    stop: RouteStop;
    route: Route;
    driver: Driver | null;
  }[]> {
    const incidentStops = await db
      .select()
      .from(routeStops)
      .where(eq(routeStops.status, 'INCIDENT'))
      .orderBy(desc(routeStops.incident_at), desc(routeStops.id));

    if (incidentStops.length === 0) return [];

    const routeIds = Array.from(new Set(incidentStops.map((s) => s.route_id)));
    const routeRows = await db
      .select()
      .from(routes)
      .where(sql`${routes.id} IN (${sql.join(routeIds.map((id) => sql`${id}`), sql`, `)})`);

    const routeMap = new Map<number, Route>();
    for (const r of routeRows) {
      routeMap.set(r.id, this.parseRouteRow(r));
    }

    const driverIds = Array.from(
      new Set(
        routeRows
          .map((r) => r.accepted_driver_id)
          .filter((id): id is number => id !== null && id !== undefined)
      )
    );

    const driverMap = new Map<number, Driver>();
    if (driverIds.length > 0) {
      const driverRows = await db
        .select()
        .from(drivers)
        .where(sql`${drivers.id} IN (${sql.join(driverIds.map((id) => sql`${id}`), sql`, `)})`);
      for (const d of driverRows) {
        driverMap.set(d.id, d as Driver);
      }
    }

    let items = incidentStops.map((s) => {
      const route = routeMap.get(s.route_id)!;
      const driver = route?.accepted_driver_id ? driverMap.get(route.accepted_driver_id) || null : null;
      return {
        stop: s as RouteStop,
        route,
        driver,
      };
    });

    if (filters?.resolution_status && filters.resolution_status !== 'ALL') {
      items = items.filter((item) => (item.stop.incident_resolution_status || 'OPEN') === filters.resolution_status);
    }

    if (filters?.search) {
      const q = filters.search.toLowerCase();
      items = items.filter(
        (item) =>
          item.stop.cargo_description.toLowerCase().includes(q) ||
          item.stop.destination_address.toLowerCase().includes(q) ||
          item.stop.destination_neighborhood.toLowerCase().includes(q) ||
          (item.stop.incident_type || '').toLowerCase().includes(q) ||
          (item.stop.incident_note || '').toLowerCase().includes(q) ||
          (item.driver?.name || '').toLowerCase().includes(q) ||
          String(item.route.id).includes(q)
      );
    }

    return items;
  }

  // ==========================================
  // M4.1 PARTE C: Gestão de Pagamentos (💰 PAGAMENTOS)
  // ==========================================

  /**
   * Registrar pagamento de rota concluída
   * Não realiza integração bancária automática (gestão operacional)
   */
  public async registerRoutePayment(
    routeId: number,
    data: {
      paid_by: string;
      payment_method?: string;
      payment_reference?: string;
      payment_note?: string;
    }
  ): Promise<Route> {
    const route = await this.getRouteById(routeId);
    if (!route) throw new Error('ROUTE_NOT_FOUND');

    if (route.status !== 'COMPLETED') {
      throw new Error(
        `CANNOT_PAY_NON_COMPLETED_ROUTE: Apenas rotas com status COMPLETED podem ser pagas (status atual: ${route.status})`
      );
    }

    if (route.payment_status === 'PAID') {
      throw new Error('ROUTE_ALREADY_PAID: O pagamento desta rota já foi registrado');
    }

    const now = new Date();
    await db
      .update(routes)
      .set({
        payment_status: 'PAID',
        paid_at: now,
        paid_by: data.paid_by,
        payment_method: data.payment_method || 'PIX',
        payment_reference: data.payment_reference?.trim() || null,
        payment_note: data.payment_note?.trim() || null,
      })
      .where(eq(routes.id, routeId));

    await db.insert(routeEvents).values({
      route_id: routeId,
      event_type: 'ROUTE_PAYMENT_REGISTERED',
      actor: data.paid_by,
      details: `Payment registered: R$ ${route.total_fee} via ${data.payment_method || 'PIX'}${
        data.payment_reference ? ' (Ref: ' + data.payment_reference + ')' : ''
      }`,
    });

    // Notificar motorista via Telegram se cadastrado
    if (route.accepted_driver_id) {
      try {
        const [driver] = await db
          .select()
          .from(drivers)
          .where(eq(drivers.id, route.accepted_driver_id));
        if (driver && driver.telegram_chat_id) {
          const msg =
            `💰 *Repasse Realizado com Sucesso!*\n\n` +
            `O pagamento referente à *Rota #${route.id}* no valor de *R$ ${route.total_fee}* foi registrado via Pix.\n\n` +
            (data.payment_reference ? `*Comprovante/Ref:* \`${data.payment_reference}\`\n` : '') +
            (data.payment_note ? `*Observação:* ${data.payment_note}\n` : '') +
            `\nAgradecemos pela sua dedicação nas entregas! 🚀`;
          await telegramBot.sendMessage(driver.telegram_chat_id, msg);
        }
      } catch (notifyErr: any) {
        console.warn('[RouteService] Failed to notify driver of payment via Telegram:', notifyErr.message);
      }
    }

    const updated = await this.getRouteById(routeId);
    return updated!;
  }

  /**
   * Resumo e listagem de pagamentos de rotas para o painel administrativo
   */
  public async getPaymentsData(filters?: {
    payment_status?: 'PENDING' | 'PAID' | 'ALL';
    driver_id?: number;
    search?: string;
  }): Promise<{
    summary: {
      totalPendingAmount: number;
      totalPaidAmount: number;
      pendingRoutesCount: number;
      paidRoutesCount: number;
      totalCompletedRoutesCount: number;
    };
    driversSummary: {
      driver: Driver;
      pendingAmount: number;
      pendingRoutesCount: number;
      paidAmount: number;
      paidRoutesCount: number;
    }[];
    routes: {
      route: Route;
      driver: Driver | null;
    }[];
  }> {
    // Buscar rotas concluídas
    const completedRows = await db
      .select()
      .from(routes)
      .where(eq(routes.status, 'COMPLETED'))
      .orderBy(desc(routes.completed_at), desc(routes.id));

    // Carregar paradas para calcular totais ou exibir informações completas
    const allRoutes = completedRows.map((r) => this.parseRouteRow(r));

    // Carregar motoristas
    const driverIds = Array.from(
      new Set(
        allRoutes
          .map((r) => r.accepted_driver_id)
          .filter((id): id is number => id !== null && id !== undefined)
      )
    );

    const driverMap = new Map<number, Driver>();
    if (driverIds.length > 0) {
      const driverRows = await db
        .select()
        .from(drivers)
        .where(sql`${drivers.id} IN (${sql.join(driverIds.map((id) => sql`${id}`), sql`, `)})`);
      for (const d of driverRows) {
        driverMap.set(d.id, d as Driver);
      }
    }

    // Helper para converter string de valor para número (ex: "35,00" ou "45.00")
    const parseCurrency = (fee: string | null | undefined): number => {
      if (!fee) return 0;
      const cleaned = String(fee).replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
      const num = parseFloat(cleaned);
      return isNaN(num) ? 0 : num;
    };

    let totalPendingAmount = 0;
    let totalPaidAmount = 0;
    let pendingRoutesCount = 0;
    let paidRoutesCount = 0;

    // Resumo por motorista
    const perDriverMap = new Map<
      number,
      {
        driver: Driver;
        pendingAmount: number;
        pendingRoutesCount: number;
        paidAmount: number;
        paidRoutesCount: number;
      }
    >();

    for (const r of allRoutes) {
      const feeNum = parseCurrency(r.total_fee);
      const isPaid = r.payment_status === 'PAID';

      if (isPaid) {
        totalPaidAmount += feeNum;
        paidRoutesCount++;
      } else {
        totalPendingAmount += feeNum;
        pendingRoutesCount++;
      }

      if (r.accepted_driver_id && driverMap.has(r.accepted_driver_id)) {
        const driver = driverMap.get(r.accepted_driver_id)!;
        if (!perDriverMap.has(driver.id)) {
          perDriverMap.set(driver.id, {
            driver,
            pendingAmount: 0,
            pendingRoutesCount: 0,
            paidAmount: 0,
            paidRoutesCount: 0,
          });
        }
        const item = perDriverMap.get(driver.id)!;
        if (isPaid) {
          item.paidAmount += feeNum;
          item.paidRoutesCount++;
        } else {
          item.pendingAmount += feeNum;
          item.pendingRoutesCount++;
        }
      }
    }

    let filteredRoutes = allRoutes.map((route) => ({
      route,
      driver: route.accepted_driver_id ? driverMap.get(route.accepted_driver_id) || null : null,
    }));

    if (filters?.payment_status && filters.payment_status !== 'ALL') {
      filteredRoutes = filteredRoutes.filter((item) => item.route.payment_status === filters.payment_status);
    }

    if (filters?.driver_id) {
      filteredRoutes = filteredRoutes.filter((item) => item.route.accepted_driver_id === filters.driver_id);
    }

    if (filters?.search) {
      const q = filters.search.toLowerCase();
      filteredRoutes = filteredRoutes.filter(
        (item) =>
          String(item.route.id).includes(q) ||
          item.route.pickup_name.toLowerCase().includes(q) ||
          (item.driver?.name || '').toLowerCase().includes(q) ||
          (item.driver?.phone || '').includes(q) ||
          (item.driver?.pix_key_value || '').toLowerCase().includes(q) ||
          (item.route.payment_reference || '').toLowerCase().includes(q)
      );
    }

    return {
      summary: {
        totalPendingAmount,
        totalPaidAmount,
        pendingRoutesCount,
        paidRoutesCount,
        totalCompletedRoutesCount: allRoutes.length,
      },
      driversSummary: Array.from(perDriverMap.values()).sort(
        (a, b) => b.pendingAmount - a.pendingAmount
      ),
      routes: filteredRoutes,
    };
  }
}

export const routeService = new RouteService();
telegramBot.setRouteService(routeService);
