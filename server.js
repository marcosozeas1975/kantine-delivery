var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/db/schema.ts
var schema_exports = {};
__export(schema_exports, {
  deliveries: () => deliveries,
  deliveryConfigurations: () => deliveryConfigurations,
  deliveryEvents: () => deliveryEvents,
  deliveryModalities: () => deliveryModalities,
  deliveryOfferDispatches: () => deliveryOfferDispatches,
  driverEvents: () => driverEvents,
  driverInvitations: () => driverInvitations,
  driverReferralEvents: () => driverReferralEvents,
  driverReferrals: () => driverReferrals,
  drivers: () => drivers,
  freightPrices: () => freightPrices,
  neighborhoods: () => neighborhoods,
  pickupLocations: () => pickupLocations,
  routeEvents: () => routeEvents,
  routeOfferDispatches: () => routeOfferDispatches,
  routeStops: () => routeStops,
  routeUpdates: () => routeUpdates,
  routes: () => routes,
  takeatConfigs: () => takeatConfigs,
  takeatOrders: () => takeatOrders,
  telegramBotSessions: () => telegramBotSessions,
  users: () => users
});
import { sql } from "drizzle-orm";
import { boolean, check, integer, jsonb, numeric, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
var users, drivers, driverEvents, deliveries, deliveryOfferDispatches, deliveryEvents, pickupLocations, deliveryModalities, neighborhoods, deliveryConfigurations, freightPrices, routes, routeStops, routeOfferDispatches, routeEvents, routeUpdates, driverInvitations, driverReferrals, driverReferralEvents, telegramBotSessions, takeatConfigs, takeatOrders;
var init_schema = __esm({
  "src/db/schema.ts"() {
    users = pgTable("users", {
      id: serial("id").primaryKey(),
      uid: text("uid").notNull().unique(),
      email: text("email").notNull(),
      createdAt: timestamp("created_at").defaultNow().notNull()
    });
    drivers = pgTable(
      "drivers",
      {
        id: serial("id").primaryKey(),
        telegram_user_id: text("telegram_user_id").notNull().unique(),
        telegram_chat_id: text("telegram_chat_id").notNull(),
        name: text("name").notNull(),
        phone: text("phone").notNull(),
        vehicle_type: text("vehicle_type").notNull(),
        // CAR_HATCH | CAR_SEDAN | CAR_SW | MOTO_WITH_BAG | MOTO_WITHOUT_BAG | OTHER
        pix_key: text("pix_key"),
        // Kept for backward compatibility
        pix_key_type: text("pix_key_type").notNull().default("REQUIRES_UPDATE"),
        // CPF | PHONE | EMAIL | RANDOM | REQUIRES_UPDATE
        pix_key_value: text("pix_key_value"),
        status: text("status").notNull().default("PENDING"),
        // PENDING | ACTIVE | BLOCKED | EXCLUDED
        // Exclusion fields & historical memory
        is_excluded: boolean("is_excluded").default(false).notNull(),
        excluded_at: timestamp("excluded_at"),
        exclusion_reason: text("exclusion_reason"),
        excluded_by: text("excluded_by"),
        previous_exclusion_reason: text("previous_exclusion_reason"),
        exclusion_count: integer("exclusion_count").default(0).notNull(),
        // Blocked Reactivation Request fields
        reactivation_requested: boolean("reactivation_requested").default(false).notNull(),
        reactivation_requested_at: timestamp("reactivation_requested_at"),
        reactivation_reason: text("reactivation_reason"),
        // Excluded Reinclusion Request fields
        reinclusion_requested: boolean("reinclusion_requested").default(false).notNull(),
        reinclusion_requested_at: timestamp("reinclusion_requested_at"),
        reinclusion_reason: text("reinclusion_reason"),
        created_at: timestamp("created_at").defaultNow().notNull(),
        updated_at: timestamp("updated_at").defaultNow().notNull()
      },
      (table) => [
        check("drivers_status_check", sql`${table.status} IN ('PENDING', 'ACTIVE', 'BLOCKED', 'EXCLUDED')`),
        check(
          "drivers_vehicle_type_canonical_check",
          sql`length(trim(${table.vehicle_type})) > 0`
        ),
        check(
          "drivers_pix_key_type_check",
          sql`${table.pix_key_type} IN ('CPF', 'PHONE', 'EMAIL', 'RANDOM', 'REQUIRES_UPDATE')`
        )
      ]
    );
    driverEvents = pgTable("driver_events", {
      id: serial("id").primaryKey(),
      driver_id: integer("driver_id").references(() => drivers.id, { onDelete: "cascade" }).notNull(),
      event_type: text("event_type").notNull(),
      // DRIVER_REGISTERED | DRIVER_APPROVED | DRIVER_BLOCKED | DRIVER_REACTIVATED | DRIVER_PROFILE_UPDATED
      actor_type: text("actor_type"),
      // DRIVER | ADMIN | SYSTEM
      actor_id: text("actor_id"),
      field_changed: text("field_changed"),
      // name | phone | vehicle_type | pix
      old_value: text("old_value"),
      new_value: text("new_value"),
      details: text("details"),
      timestamp: timestamp("timestamp").defaultNow().notNull()
    });
    deliveries = pgTable(
      "deliveries",
      {
        id: serial("id").primaryKey(),
        pickup_location: text("pickup_location").notNull().default("Kantine Matriz"),
        destination_address: text("destination_address").notNull(),
        destination_neighborhood: text("destination_neighborhood").notNull(),
        cargo_description: text("cargo_description").notNull(),
        delivery_fee: text("delivery_fee").notNull(),
        delivery_mode: text("delivery_mode").notNull().default("IN_PERSON"),
        // IN_PERSON | NO_CONTACT
        observations: text("observations"),
        status: text("status").notNull().default("DRAFT"),
        // DRAFT | OFFERED | ACCEPTED | CANCELLED
        created_at: timestamp("created_at").defaultNow().notNull(),
        offered_at: timestamp("offered_at"),
        accepted_driver_id: integer("accepted_driver_id").references(() => drivers.id, { onDelete: "set null" }),
        accepted_at: timestamp("accepted_at")
      },
      (table) => [
        check("deliveries_status_check", sql`${table.status} IN ('DRAFT', 'OFFERED', 'ACCEPTED', 'CANCELLED')`),
        check("deliveries_mode_check", sql`${table.delivery_mode} IN ('IN_PERSON', 'NO_CONTACT')`),
        check(
          "deliveries_accepted_integrity_check",
          sql`(${table.status} = 'ACCEPTED' AND ${table.accepted_driver_id} IS NOT NULL AND ${table.accepted_at} IS NOT NULL) OR (${table.status} != 'ACCEPTED')`
        )
      ]
    );
    deliveryOfferDispatches = pgTable(
      "delivery_offer_dispatches",
      {
        id: serial("id").primaryKey(),
        delivery_id: integer("delivery_id").references(() => deliveries.id, { onDelete: "cascade" }).notNull(),
        driver_id: integer("driver_id").references(() => drivers.id, { onDelete: "cascade" }).notNull(),
        telegram_chat_id: text("telegram_chat_id").notNull(),
        telegram_message_id: text("telegram_message_id"),
        status: text("status").notNull(),
        // SENT | FAILED
        sent_at: timestamp("sent_at").defaultNow().notNull(),
        error_code: text("error_code")
      },
      (table) => [
        check("dispatches_status_check", sql`${table.status} IN ('SENT', 'FAILED')`)
      ]
    );
    deliveryEvents = pgTable("delivery_events", {
      id: serial("id").primaryKey(),
      delivery_id: integer("delivery_id").references(() => deliveries.id, { onDelete: "cascade" }).notNull(),
      event_type: text("event_type").notNull(),
      // DELIVERY_CREATED | DELIVERY_OFFERED | DELIVERY_ACCEPTED | DELIVERY_CANCELLED
      timestamp: timestamp("timestamp").defaultNow().notNull(),
      actor: text("actor")
    });
    pickupLocations = pgTable("pickup_locations", {
      id: serial("id").primaryKey(),
      name: text("name").notNull(),
      address: text("address").notNull(),
      neighborhood: text("neighborhood"),
      // Bairro da coleta estruturado
      active: boolean("active").default(true).notNull(),
      created_at: timestamp("created_at").defaultNow().notNull(),
      updated_at: timestamp("updated_at").defaultNow().notNull()
    });
    deliveryModalities = pgTable("delivery_modalities", {
      id: serial("id").primaryKey(),
      name: text("name").notNull(),
      // e.g. Bolo, Cesta, Convencional
      code: text("code").notNull().unique(),
      // e.g. BOLO, CESTA, CONVENCIONAL
      active: boolean("active").default(true).notNull(),
      created_at: timestamp("created_at").defaultNow().notNull(),
      updated_at: timestamp("updated_at").defaultNow().notNull()
    });
    neighborhoods = pgTable("neighborhoods", {
      id: serial("id").primaryKey(),
      name: text("name").notNull(),
      normalized_name: text("normalized_name").notNull().unique(),
      active: boolean("active").default(true).notNull(),
      created_at: timestamp("created_at").defaultNow().notNull(),
      updated_at: timestamp("updated_at").defaultNow().notNull()
    });
    deliveryConfigurations = pgTable("delivery_configurations", {
      key: text("key").primaryKey(),
      // LOGISTICS_MANAGEMENT_RATE, DEFAULT_ROUTE_DISCOUNT_PERCENT
      value: text("value").notNull(),
      description: text("description"),
      updated_at: timestamp("updated_at").defaultNow().notNull()
    });
    freightPrices = pgTable(
      "freight_prices",
      {
        id: serial("id").primaryKey(),
        neighborhood_id: integer("neighborhood_id").references(() => neighborhoods.id, { onDelete: "cascade" }).notNull(),
        modality_code: text("modality_code").notNull(),
        vehicle_category: text("vehicle_category").notNull(),
        // CAR | MOTO | MOTO_WITH_BAG
        price: numeric("price", { precision: 10, scale: 2 }).notNull(),
        active: boolean("active").default(true).notNull(),
        created_at: timestamp("created_at").defaultNow().notNull(),
        updated_at: timestamp("updated_at").defaultNow().notNull()
      },
      (table) => [
        check(
          "freight_vehicle_category_check",
          sql`${table.vehicle_category} IN ('CAR', 'MOTO', 'MOTO_WITH_BAG')`
        )
      ]
    );
    routes = pgTable(
      "routes",
      {
        id: serial("id").primaryKey(),
        pickup_type: text("pickup_type").notNull().default("REGISTERED"),
        // REGISTERED | AD_HOC
        pickup_location_id: integer("pickup_location_id").references(() => pickupLocations.id, { onDelete: "set null" }),
        pickup_name: text("pickup_name").notNull(),
        pickup_address: text("pickup_address").notNull(),
        pickup_neighborhood_snapshot: text("pickup_neighborhood_snapshot"),
        final_deadline: text("final_deadline").notNull(),
        total_fee: text("total_fee").notNull(),
        accepted_vehicle_types: text("accepted_vehicle_types").notNull(),
        // JSON array string e.g. ["CAR_HATCH","MOTO_WITH_BAG"]
        status: text("status").notNull().default("DRAFT"),
        // DRAFT | OFFERED | ACCEPTED | ARRIVED_PICKUP | PICKED_UP | IN_TRANSIT | COMPLETED | CANCELLED
        accepted_driver_id: integer("accepted_driver_id").references(() => drivers.id, { onDelete: "set null" }),
        accepted_at: timestamp("accepted_at"),
        arrived_pickup_at: timestamp("arrived_pickup_at"),
        picked_up_at: timestamp("picked_up_at"),
        started_at: timestamp("started_at"),
        completed_at: timestamp("completed_at"),
        payment_status: text("payment_status").notNull().default("PENDING"),
        // PENDING | PAID
        paid_at: timestamp("paid_at"),
        paid_by: text("paid_by"),
        payment_method: text("payment_method").default("PIX"),
        payment_reference: text("payment_reference"),
        payment_note: text("payment_note"),
        // M4.2 Campos Financeiros & Precificação
        customer_freight_total: numeric("customer_freight_total", { precision: 10, scale: 2 }),
        management_rate_snapshot: numeric("management_rate_snapshot", { precision: 6, scale: 4 }),
        management_amount_total: numeric("management_amount_total", { precision: 10, scale: 2 }),
        route_base_amount: numeric("route_base_amount", { precision: 10, scale: 2 }),
        route_discount_percent_snapshot: numeric("route_discount_percent_snapshot", { precision: 6, scale: 4 }),
        suggested_driver_fee: numeric("suggested_driver_fee", { precision: 10, scale: 2 }),
        final_driver_fee: numeric("final_driver_fee", { precision: 10, scale: 2 }),
        override_reason: text("override_reason"),
        // M4.4 Versionamento e Edição Controlada
        route_version: integer("route_version").default(1).notNull(),
        driver_acknowledged_version: integer("driver_acknowledged_version").default(1).notNull(),
        change_pending_driver_approval: boolean("change_pending_driver_approval").default(false).notNull(),
        pending_material_change: text("pending_material_change"),
        created_at: timestamp("created_at").defaultNow().notNull(),
        offered_at: timestamp("offered_at")
      },
      (table) => [
        check(
          "routes_status_check",
          sql`${table.status} IN ('DRAFT', 'OFFERED', 'ACCEPTED', 'ARRIVED_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED')`
        ),
        check("routes_pickup_type_check", sql`${table.pickup_type} IN ('REGISTERED', 'AD_HOC')`),
        check(
          "routes_accepted_integrity_check",
          sql`(${table.status} IN ('ACCEPTED', 'ARRIVED_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'COMPLETED') AND ${table.accepted_driver_id} IS NOT NULL AND ${table.accepted_at} IS NOT NULL) OR (${table.status} NOT IN ('ACCEPTED', 'ARRIVED_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'COMPLETED'))`
        ),
        check("routes_payment_status_check", sql`${table.payment_status} IN ('PENDING', 'PAID')`)
      ]
    );
    routeStops = pgTable(
      "route_stops",
      {
        id: serial("id").primaryKey(),
        route_id: integer("route_id").references(() => routes.id, { onDelete: "cascade" }).notNull(),
        sequence: integer("sequence").notNull(),
        destination_address: text("destination_address").notNull(),
        destination_neighborhood: text("destination_neighborhood").notNull(),
        cargo_description: text("cargo_description").notNull(),
        delivery_mode: text("delivery_mode").notNull().default("IN_PERSON"),
        // IN_PERSON | NO_CONTACT
        observations: text("observations"),
        desired_deadline: text("desired_deadline"),
        // optional (ex: 16:30)
        status: text("status").notNull().default("PENDING"),
        // PENDING | DELIVERED | INCIDENT | CANCELLED
        pin_code: text("pin_code"),
        // 4-digit PIN for IN_PERSON proof
        delivered_at: timestamp("delivered_at"),
        proof_type: text("proof_type"),
        // PIN | PHOTO
        proof_reference: text("proof_reference"),
        // Telegram file_id or evidence reference
        incident_type: text("incident_type"),
        // CLIENTE_AUSENTE | ENDERECO_NAO_LOCALIZADO | CLIENTE_RECUSOU | OUTRO
        incident_note: text("incident_note"),
        incident_at: timestamp("incident_at"),
        incident_resolution_status: text("incident_resolution_status"),
        // OPEN | RESOLVED
        resolution_type: text("resolution_type"),
        // RETURN_TO_ORIGIN | DELIVERED_LATER | DELIVERED_TO_ALTERNATIVE_LOCATION | CUSTOMER_PICKUP | DISCARDED | OTHER
        resolution_note: text("resolution_note"),
        resolved_at: timestamp("resolved_at"),
        resolved_by: text("resolved_by"),
        compensation_amount: numeric("compensation_amount", { precision: 10, scale: 2 }),
        // M4.2 Modalidade, Bairro e Frete Cobrado do Cliente por Parada
        modality_code: text("modality_code").default("CONVENCIONAL").notNull(),
        neighborhood_id: integer("neighborhood_id").references(() => neighborhoods.id, { onDelete: "set null" }),
        pricing_vehicle_category: text("pricing_vehicle_category"),
        // CAR | MOTO | MOTO_WITH_BAG
        customer_freight: numeric("customer_freight", { precision: 10, scale: 2 }),
        net_delivery_base: numeric("net_delivery_base", { precision: 10, scale: 2 }),
        management_amount: numeric("management_amount", { precision: 10, scale: 2 }),
        created_at: timestamp("created_at").defaultNow().notNull(),
        completed_at: timestamp("completed_at")
      },
      (table) => [
        check("route_stops_status_check", sql`${table.status} IN ('PENDING', 'DELIVERED', 'INCIDENT', 'CANCELLED')`),
        check("route_stops_mode_check", sql`${table.delivery_mode} IN ('IN_PERSON', 'NO_CONTACT')`),
        check(
          "route_stops_resolution_status_check",
          sql`${table.incident_resolution_status} IS NULL OR ${table.incident_resolution_status} IN ('OPEN', 'RESOLVED')`
        ),
        check(
          "route_stops_resolution_type_check",
          sql`${table.resolution_type} IS NULL OR ${table.resolution_type} IN ('RETURN_TO_ORIGIN', 'DELIVERED_LATER', 'DELIVERED_TO_ALTERNATIVE_LOCATION', 'CUSTOMER_PICKUP', 'DISCARDED', 'CANCELLATION', 'OTHER')`
        )
      ]
    );
    routeOfferDispatches = pgTable(
      "route_offer_dispatches",
      {
        id: serial("id").primaryKey(),
        route_id: integer("route_id").references(() => routes.id, { onDelete: "cascade" }).notNull(),
        route_version: integer("route_version").default(1).notNull(),
        driver_id: integer("driver_id").references(() => drivers.id, { onDelete: "cascade" }).notNull(),
        telegram_chat_id: text("telegram_chat_id").notNull(),
        telegram_message_id: text("telegram_message_id"),
        status: text("status").notNull(),
        // SENT | FAILED
        sent_at: timestamp("sent_at").defaultNow().notNull(),
        error_code: text("error_code")
      },
      (table) => [
        check("route_dispatches_status_check", sql`${table.status} IN ('SENT', 'FAILED')`)
      ]
    );
    routeEvents = pgTable("route_events", {
      id: serial("id").primaryKey(),
      route_id: integer("route_id").references(() => routes.id, { onDelete: "cascade" }).notNull(),
      event_type: text("event_type").notNull(),
      // ROUTE_CREATED | ROUTE_OFFERED | ROUTE_ACCEPTED | ROUTE_CANCELLED | ROUTE_STOP_CREATED | ROUTE_STOP_REORDERED | ROUTE_UPDATED | ROUTE_CHANGE_ACCEPTED | ROUTE_CHANGE_REJECTED
      timestamp: timestamp("timestamp").defaultNow().notNull(),
      actor: text("actor"),
      details: text("details")
    });
    routeUpdates = pgTable(
      "route_updates",
      {
        id: serial("id").primaryKey(),
        route_id: integer("route_id").references(() => routes.id, { onDelete: "cascade" }).notNull(),
        old_version: integer("old_version").notNull(),
        new_version: integer("new_version").notNull(),
        change_type: text("change_type").notNull(),
        // OPERATIONAL | MATERIAL | DRAFT_EDIT | OFFERED_REOFFER
        changed_fields: text("changed_fields").notNull(),
        // JSON string e.g. ["destination_address"]
        diff_summary: text("diff_summary").notNull(),
        // Resumo legível das diferenças
        previous_snapshot: text("previous_snapshot").notNull(),
        // JSON do estado anterior da rota e paradas
        new_snapshot: text("new_snapshot"),
        // JSON do estado resultante após alteração (ou null se pendente)
        pending_proposal: text("pending_proposal"),
        // Proposta pendente se alteração material
        actor: text("actor").notNull(),
        // Identificação do autor da alteração
        driver_approval_status: text("driver_approval_status").default("NOT_REQUIRED").notNull(),
        // NOT_REQUIRED | PENDING | ACCEPTED | REJECTED
        driver_decision_at: timestamp("driver_decision_at"),
        driver_acknowledged_at: timestamp("driver_acknowledged_at"),
        created_at: timestamp("created_at").defaultNow().notNull()
      },
      (table) => [
        check(
          "route_updates_change_type_check",
          sql`${table.change_type} IN ('OPERATIONAL', 'MATERIAL', 'DRAFT_EDIT', 'OFFERED_REOFFER')`
        ),
        check(
          "route_updates_approval_status_check",
          sql`${table.driver_approval_status} IN ('NOT_REQUIRED', 'PENDING', 'ACCEPTED', 'REJECTED')`
        )
      ]
    );
    driverInvitations = pgTable(
      "driver_invitations",
      {
        id: serial("id").primaryKey(),
        token: text("token").notNull().unique(),
        name: text("name"),
        phone: text("phone"),
        vehicle_type: text("vehicle_type"),
        status: text("status").notNull().default("PENDING"),
        // PENDING | COMPLETED | CANCELLED
        created_by: text("created_by"),
        telegram_user_id: text("telegram_user_id"),
        driver_id: integer("driver_id").references(() => drivers.id, { onDelete: "set null" }),
        created_at: timestamp("created_at").defaultNow().notNull(),
        completed_at: timestamp("completed_at")
      },
      (table) => [
        check("driver_invitations_status_check", sql`${table.status} IN ('PENDING', 'COMPLETED', 'CANCELLED')`)
      ]
    );
    driverReferrals = pgTable(
      "driver_referrals",
      {
        id: serial("id").primaryKey(),
        referred_by_driver_id: integer("referred_by_driver_id").references(() => drivers.id, { onDelete: "cascade" }).notNull(),
        referred_name: text("referred_name").notNull(),
        referred_phone: text("referred_phone").notNull(),
        status: text("status").notNull().default("PENDING_REVIEW"),
        // PENDING_REVIEW | APPROVED | REJECTED | INVITE_USED | EXPIRED
        invitation_token: text("invitation_token").unique(),
        invitation_expires_at: timestamp("invitation_expires_at"),
        invitation_used_at: timestamp("invitation_used_at"),
        invited_telegram_user_id: text("invited_telegram_user_id"),
        resulting_driver_id: integer("resulting_driver_id").references(() => drivers.id, { onDelete: "set null" }),
        reviewed_at: timestamp("reviewed_at"),
        reviewed_by: text("reviewed_by"),
        rejection_reason: text("rejection_reason"),
        created_at: timestamp("created_at").defaultNow().notNull(),
        updated_at: timestamp("updated_at").defaultNow().notNull()
      },
      (table) => [
        check(
          "driver_referrals_status_check",
          sql`${table.status} IN ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'INVITE_USED', 'EXPIRED')`
        )
      ]
    );
    driverReferralEvents = pgTable("driver_referral_events", {
      id: serial("id").primaryKey(),
      referral_id: integer("referral_id").references(() => driverReferrals.id, { onDelete: "cascade" }).notNull(),
      event_type: text("event_type").notNull(),
      // DRIVER_REFERRAL_CREATED | DRIVER_REFERRAL_APPROVED | DRIVER_REFERRAL_REJECTED | DRIVER_INVITE_CONSUMED | DRIVER_REFERRAL_EXPIRED
      actor_type: text("actor_type").notNull(),
      // DRIVER | ADMIN | SYSTEM
      actor_id: text("actor_id"),
      details: text("details"),
      timestamp: timestamp("timestamp").defaultNow().notNull()
    });
    telegramBotSessions = pgTable("telegram_bot_sessions", {
      userId: text("user_id").primaryKey(),
      sessionType: text("session_type").notNull(),
      // WIZARD | EDIT | REFERRAL | REACTIVATION
      step: text("step").notNull(),
      data: jsonb("data").default({}).notNull(),
      updatedAt: timestamp("updated_at").defaultNow().notNull()
    });
    takeatConfigs = pgTable("takeat_configs", {
      id: serial("id").primaryKey(),
      store_key: text("store_key").default("MATRIZ").notNull(),
      // MATRIZ | VINHEDOS
      store_name: text("store_name").default("Kantine Matriz").notNull(),
      api_key: text("api_key"),
      // Chave de API / Token seguro do Takeat
      webhook_secret: text("webhook_secret"),
      // Segredo de assinatura de webhooks
      store_id: text("store_id"),
      // ID ou Slug da loja no Takeat (ex: kantine-matriz / kantine-vinhedos)
      default_pickup_preset: text("default_pickup_preset").default("MATRIZ").notNull(),
      // MATRIZ | VINHEDOS
      auto_calculate_freight: boolean("auto_calculate_freight").default(true).notNull(),
      preferred_modality: text("preferred_modality").default("MOTO").notNull(),
      // MOTO | CAR
      notification_sound_enabled: boolean("notification_sound_enabled").default(true).notNull(),
      is_active: boolean("is_active").default(true).notNull(),
      last_webhook_received_at: timestamp("last_webhook_received_at"),
      created_at: timestamp("created_at").defaultNow().notNull(),
      updated_at: timestamp("updated_at").defaultNow().notNull()
    });
    takeatOrders = pgTable(
      "takeat_orders",
      {
        id: serial("id").primaryKey(),
        takeat_order_id: text("takeat_order_id").notNull().unique(),
        // ID original do Takeat
        store_key: text("store_key").default("MATRIZ").notNull(),
        // MATRIZ | VINHEDOS
        store_id: text("store_id"),
        // ID da loja de onde o pedido veio
        display_id: text("display_id").notNull(),
        // Ex: "#1042"
        customer_name: text("customer_name").notNull(),
        customer_phone: text("customer_phone"),
        destination_address: text("destination_address").notNull(),
        destination_neighborhood: text("destination_neighborhood").notNull(),
        destination_city: text("destination_city").default("Uberl\xE2ndia").notNull(),
        order_items_summary: text("order_items_summary"),
        order_items_json: jsonb("order_items_json"),
        order_total: numeric("order_total", { precision: 10, scale: 2 }),
        delivery_fee_charged: numeric("delivery_fee_charged", { precision: 10, scale: 2 }),
        // Taxa cobrada pelo Takeat
        payment_method: text("payment_method"),
        change_for: numeric("change_for", { precision: 10, scale: 2 }),
        pickup_preset: text("pickup_preset").default("MATRIZ").notNull(),
        status: text("status").default("PENDING_COURIER").notNull(),
        // PENDING_COURIER | IN_ROUTE | DELIVERED | DISMISSED
        calculated_freight_value: numeric("calculated_freight_value", { precision: 10, scale: 2 }),
        // Frete calculado pelo motor da Kantine
        calculated_freight_details: jsonb("calculated_freight_details"),
        created_route_id: integer("created_route_id").references(() => routes.id, { onDelete: "set null" }),
        raw_payload: jsonb("raw_payload"),
        created_at: timestamp("created_at").defaultNow().notNull(),
        accepted_at: timestamp("accepted_at"),
        dispatched_at: timestamp("dispatched_at")
      },
      (table) => [
        check(
          "takeat_orders_status_check",
          sql`${table.status} IN ('PENDING_COURIER', 'IN_ROUTE', 'DELIVERED', 'DISMISSED')`
        )
      ]
    );
  }
});

// src/db/index.ts
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
async function initDbConstraints() {
  const adminUser = process.env.SQL_ADMIN_USER || process.env.SQL_USER;
  const adminPassword = process.env.SQL_ADMIN_PASSWORD || process.env.SQL_PASSWORD;
  const targetDatabase = process.env.FORCE_DEV_DB === "true" ? process.env.SQL_DB_NAME || "cloud_sql_development_database" : "cloud_sql_production_database";
  const adminPool = new Pool({
    host: process.env.SQL_HOST,
    user: adminUser,
    password: adminPassword,
    database: targetDatabase,
    max: 1,
    connectionTimeoutMillis: 1e4
  });
  adminPool.on("error", (err) => {
    console.warn("[Postgres adminPool] Connection event caught:", err?.message || err);
  });
  try {
    const client = await adminPool.connect();
    try {
      await client.query(`ALTER TABLE "routes" DROP CONSTRAINT IF EXISTS "routes_status_check"`);
      await client.query(`ALTER TABLE "routes" ADD CONSTRAINT "routes_status_check" CHECK (status IN ('DRAFT', 'OFFERED', 'ACCEPTED', 'ARRIVED_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED'))`);
      await client.query(`ALTER TABLE "routes" DROP CONSTRAINT IF EXISTS "routes_accepted_integrity_check"`);
      await client.query(`ALTER TABLE "routes" ADD CONSTRAINT "routes_accepted_integrity_check" CHECK (
        (status IN ('ACCEPTED', 'ARRIVED_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'COMPLETED') AND accepted_driver_id IS NOT NULL AND accepted_at IS NOT NULL) 
        OR (status NOT IN ('ACCEPTED', 'ARRIVED_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'COMPLETED'))
      )`);
      await client.query(`ALTER TABLE "route_stops" DROP CONSTRAINT IF EXISTS "route_stops_resolution_type_check"`);
      await client.query(`ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_resolution_type_check" CHECK (
        resolution_type IS NULL OR resolution_type IN ('RETURN_TO_ORIGIN', 'DELIVERED_LATER', 'DELIVERED_TO_ALTERNATIVE_LOCATION', 'CUSTOMER_PICKUP', 'DISCARDED', 'CANCELLATION', 'OTHER')
      )`);
      await client.query(`ALTER TABLE "route_stops" ADD COLUMN IF NOT EXISTS "compensation_amount" numeric(10,2)`);
      await client.query(`ALTER TABLE "routes" ADD COLUMN IF NOT EXISTS "route_version" integer DEFAULT 1 NOT NULL`);
      await client.query(`ALTER TABLE "routes" ADD COLUMN IF NOT EXISTS "driver_acknowledged_version" integer DEFAULT 1 NOT NULL`);
      await client.query(`ALTER TABLE "routes" ADD COLUMN IF NOT EXISTS "change_pending_driver_approval" boolean DEFAULT false NOT NULL`);
      await client.query(`ALTER TABLE "routes" ADD COLUMN IF NOT EXISTS "pending_material_change" text`);
      await client.query(`CREATE TABLE IF NOT EXISTS "route_schedules" (
        "route_id" integer PRIMARY KEY REFERENCES "routes"("id") ON DELETE CASCADE,
        "scheduled_for" timestamptz,
        "publish_at" timestamptz,
        "publish_error" text,
        "published_at" timestamptz,
        "updated_at" timestamptz DEFAULT now() NOT NULL
      )`);
      const appUser = String(process.env.SQL_USER || "");
      if (appUser && appUser !== adminUser && /^[A-Za-z0-9_.@-]+$/.test(appUser)) {
        await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON "route_schedules" TO "${appUser}"`).catch(() => {
        });
      }
      await client.query(`ALTER TABLE "route_offer_dispatches" ADD COLUMN IF NOT EXISTS "route_version" integer DEFAULT 1 NOT NULL`);
      await client.query(`ALTER TABLE "drivers" DROP CONSTRAINT IF EXISTS "drivers_status_check"`);
      await client.query(`ALTER TABLE "drivers" ADD CONSTRAINT "drivers_status_check" CHECK (status IN ('PENDING', 'ACTIVE', 'BLOCKED', 'EXCLUDED'))`);
      await client.query(`ALTER TABLE "drivers" DROP CONSTRAINT IF EXISTS "drivers_vehicle_type_canonical_check"`);
      await client.query(`ALTER TABLE "drivers" ADD CONSTRAINT "drivers_vehicle_type_canonical_check" CHECK (vehicle_type IS NOT NULL AND length(trim(vehicle_type)) > 0)`);
      await client.query(`ALTER TABLE "drivers" ADD COLUMN IF NOT EXISTS "is_excluded" boolean DEFAULT false NOT NULL`);
      await client.query(`ALTER TABLE "drivers" ADD COLUMN IF NOT EXISTS "excluded_at" timestamp`);
      await client.query(`ALTER TABLE "drivers" ADD COLUMN IF NOT EXISTS "exclusion_reason" text`);
      await client.query(`ALTER TABLE "drivers" ADD COLUMN IF NOT EXISTS "excluded_by" text`);
      await client.query(`ALTER TABLE "drivers" ADD COLUMN IF NOT EXISTS "previous_exclusion_reason" text`);
      await client.query(`ALTER TABLE "drivers" ADD COLUMN IF NOT EXISTS "exclusion_count" integer DEFAULT 0 NOT NULL`);
      await client.query(`ALTER TABLE "drivers" ADD COLUMN IF NOT EXISTS "reactivation_requested" boolean DEFAULT false NOT NULL`);
      await client.query(`ALTER TABLE "drivers" ADD COLUMN IF NOT EXISTS "reactivation_requested_at" timestamp`);
      await client.query(`ALTER TABLE "drivers" ADD COLUMN IF NOT EXISTS "reactivation_reason" text`);
      await client.query(`ALTER TABLE "drivers" ADD COLUMN IF NOT EXISTS "reinclusion_requested" boolean DEFAULT false NOT NULL`);
      await client.query(`ALTER TABLE "drivers" ADD COLUMN IF NOT EXISTS "reinclusion_requested_at" timestamp`);
      await client.query(`ALTER TABLE "drivers" ADD COLUMN IF NOT EXISTS "reinclusion_reason" text`);
      await client.query(`
        CREATE TABLE IF NOT EXISTS "route_updates" (
          "id" serial PRIMARY KEY,
          "route_id" integer NOT NULL REFERENCES "routes"("id") ON DELETE CASCADE,
          "old_version" integer NOT NULL,
          "new_version" integer NOT NULL,
          "change_type" text NOT NULL,
          "changed_fields" text NOT NULL,
          "diff_summary" text NOT NULL,
          "previous_snapshot" text NOT NULL,
          "new_snapshot" text,
          "pending_proposal" text,
          "actor" text NOT NULL,
          "driver_approval_status" text DEFAULT 'NOT_REQUIRED' NOT NULL,
          "driver_decision_at" timestamp,
          "driver_acknowledged_at" timestamp,
          "created_at" timestamp DEFAULT now() NOT NULL
        );
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS "takeat_configs" (
          "id" serial PRIMARY KEY,
          "store_key" text DEFAULT 'MATRIZ' NOT NULL,
          "store_name" text DEFAULT 'Kantine Matriz' NOT NULL,
          "api_key" text,
          "webhook_secret" text,
          "store_id" text,
          "default_pickup_preset" text DEFAULT 'MATRIZ' NOT NULL,
          "auto_calculate_freight" boolean DEFAULT true NOT NULL,
          "preferred_modality" text DEFAULT 'MOTO' NOT NULL,
          "notification_sound_enabled" boolean DEFAULT true NOT NULL,
          "is_active" boolean DEFAULT true NOT NULL,
          "last_webhook_received_at" timestamp,
          "created_at" timestamp DEFAULT now() NOT NULL,
          "updated_at" timestamp DEFAULT now() NOT NULL
        );

        -- Safe column migrations for multi-store support
        ALTER TABLE "takeat_configs" ADD COLUMN IF NOT EXISTS "store_key" text DEFAULT 'MATRIZ';
        ALTER TABLE "takeat_configs" ADD COLUMN IF NOT EXISTS "store_name" text DEFAULT 'Kantine Matriz';

        CREATE TABLE IF NOT EXISTS "takeat_orders" (
          "id" serial PRIMARY KEY,
          "takeat_order_id" text UNIQUE NOT NULL,
          "store_key" text DEFAULT 'MATRIZ' NOT NULL,
          "store_id" text,
          "display_id" text NOT NULL,
          "customer_name" text NOT NULL,
          "customer_phone" text,
          "destination_address" text NOT NULL,
          "destination_neighborhood" text NOT NULL,
          "destination_city" text DEFAULT 'Uberl\xE2ndia' NOT NULL,
          "order_items_summary" text,
          "order_items_json" jsonb,
          "order_total" numeric(10, 2),
          "delivery_fee_charged" numeric(10, 2),
          "payment_method" text,
          "change_for" numeric(10, 2),
          "pickup_preset" text DEFAULT 'MATRIZ' NOT NULL,
          "status" text DEFAULT 'PENDING_COURIER' NOT NULL CHECK (status IN ('PENDING_COURIER', 'IN_ROUTE', 'DELIVERED', 'DISMISSED')),
          "calculated_freight_value" numeric(10, 2),
          "calculated_freight_details" jsonb,
          "created_route_id" integer REFERENCES "routes"("id") ON DELETE SET NULL,
          "raw_payload" jsonb,
          "created_at" timestamp DEFAULT now() NOT NULL,
          "accepted_at" timestamp,
          "dispatched_at" timestamp
        );

        ALTER TABLE "takeat_orders" ADD COLUMN IF NOT EXISTS "store_key" text DEFAULT 'MATRIZ';
        ALTER TABLE "takeat_orders" ADD COLUMN IF NOT EXISTS "store_id" text;

        -- Ensure both MATRIZ and VINHEDOS rows exist in takeat_configs
        INSERT INTO "takeat_configs" ("store_key", "store_name", "store_id", "default_pickup_preset", "auto_calculate_freight", "preferred_modality", "is_active")
        SELECT 'MATRIZ', 'Kantine Matriz', 'kantine-matriz', 'MATRIZ', true, 'MOTO', true
        WHERE NOT EXISTS (SELECT 1 FROM "takeat_configs" WHERE "store_key" = 'MATRIZ');

        INSERT INTO "takeat_configs" ("store_key", "store_name", "store_id", "default_pickup_preset", "auto_calculate_freight", "preferred_modality", "is_active")
        SELECT 'VINHEDOS', 'Kantine Vinhedos', 'kantine-vinhedos', 'VINHEDOS', true, 'MOTO', true
        WHERE NOT EXISTS (SELECT 1 FROM "takeat_configs" WHERE "store_key" = 'VINHEDOS');
      `);
      console.log("[initDbConstraints] Successfully updated routes constraints, M4.4 schema and Takeat tables using admin pool.");
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("[initDbConstraints] Error updating constraints with admin pool:", err.message);
  } finally {
    await adminPool.end().catch(() => {
    });
  }
}
var createPool, pool, db, createProdPool, prodPool, prodDb;
var init_db = __esm({
  "src/db/index.ts"() {
    init_schema();
    createPool = () => {
      if (!global._postgresPool) {
        const targetDatabase = process.env.FORCE_DEV_DB === "true" ? process.env.SQL_DB_NAME || "cloud_sql_development_database" : "cloud_sql_production_database";
        global._postgresPool = new Pool({
          host: process.env.SQL_HOST,
          user: process.env.SQL_USER,
          password: process.env.SQL_PASSWORD,
          database: targetDatabase,
          max: 10,
          connectionTimeoutMillis: 15e3,
          idleTimeoutMillis: 3e4,
          keepAlive: true,
          keepAliveInitialDelayMillis: 1e4
        });
        global._postgresPool.on("error", (err) => {
          console.warn("[Postgres Pool] Idle client connection issue (non-fatal, auto-recovering):", err?.message || err);
        });
        global._postgresPool.on("connect", (client) => {
          client.on("error", (err) => {
            console.warn("[Postgres Client] Connection event error caught (recovering):", err?.message || err);
          });
        });
      }
      return global._postgresPool;
    };
    pool = createPool();
    db = drizzle(pool, { schema: schema_exports });
    createProdPool = () => {
      return createPool();
    };
    prodPool = createProdPool();
    prodDb = drizzle(prodPool, { schema: schema_exports });
  }
});

// src/server/types.ts
function parseVehicleInput(input) {
  if (!input) return null;
  const trimmed = input.trim();
  const lower = trimmed.toLowerCase();
  if (trimmed === "CAR" || trimmed === "CARRO") return "CAR";
  if (trimmed === "MOTO") return "MOTO";
  if (trimmed === "MOTO_WITH_BAG" || trimmed === "MOTO_COM_BAG") return "MOTO_WITH_BAG";
  if (trimmed === "CAR_HATCH" || trimmed === "CAR_SEDAN" || trimmed === "CAR_SW" || trimmed === "OTHER") return "CAR";
  if (trimmed === "MOTO_WITHOUT_BAG") return "MOTO";
  if (trimmed.startsWith("veh_toggle:")) {
    const raw = trimmed.replace("veh_toggle:", "").trim();
    return parseVehicleInput(raw);
  }
  if (trimmed.startsWith("veh_")) {
    const raw = trimmed.replace("veh_", "").trim();
    if (raw === "CAR" || raw === "CARRO" || raw === "CAR_HATCH" || raw === "CAR_SEDAN" || raw === "CAR_SW" || raw === "OTHER") return "CAR";
    if (raw === "MOTO" || raw === "MOTO_WITHOUT_BAG") return "MOTO";
    if (raw === "MOTO_WITH_BAG" || raw === "MOTO_COM_BAG") return "MOTO_WITH_BAG";
  }
  if (lower.includes("bag") || lower.includes("mochila")) return "MOTO_WITH_BAG";
  if (lower.includes("moto")) return "MOTO";
  if (lower.includes("carro") || lower.includes("car") || lower.includes("auto")) return "CAR";
  return null;
}
function parseDriverVehicleTypes(input) {
  if (!input) return [];
  if (Array.isArray(input)) {
    const res = [];
    for (const item of input) {
      const parsed = parseDriverVehicleTypes(item);
      for (const p of parsed) {
        if (!res.includes(p)) res.push(p);
      }
    }
    return res;
  }
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const arr = JSON.parse(trimmed);
        if (Array.isArray(arr)) {
          return parseDriverVehicleTypes(arr);
        }
      } catch {
      }
    }
    const lower = trimmed.toLowerCase();
    if (lower.includes("todos") || lower.includes("todas") || lower.includes("os tres") || lower.includes("as tres") || lower.includes("os 3") || lower.includes("as 3")) {
      return ["CAR", "MOTO", "MOTO_WITH_BAG"];
    }
    const tokens = trimmed.split(/[,;/+&]|\s+e\s+|\s+ou\s+/i).map((t) => t.trim()).filter(Boolean);
    const result = [];
    for (const tok of tokens) {
      const single2 = parseVehicleInput(tok);
      if (single2 && !result.includes(single2)) {
        result.push(single2);
      }
    }
    if (result.length > 0) return result;
    const single = parseVehicleInput(trimmed);
    return single ? [single] : [];
  }
  return [];
}
function getVehicleTypeLabel(type) {
  if (!type) return "N\xE3o informado";
  const types = parseDriverVehicleTypes(type);
  if (types.length === 0) return type;
  if (types.length === 1) {
    const single = types[0];
    if (single === "CAR") return "Carro";
    if (single === "MOTO") return "Moto";
    if (single === "MOTO_WITH_BAG") return "Moto com Bag";
    return single;
  }
  const labels = types.map((t) => {
    if (t === "CAR") return "Carro";
    if (t === "MOTO") return "Moto";
    if (t === "MOTO_WITH_BAG") return "Moto com Bag";
    return t;
  });
  if (labels.length === 2) return `${labels[0]} e ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")} e ${labels[labels.length - 1]}`;
}
function mapVehicleTypeToPricingCategory(type) {
  switch (type) {
    case "CAR":
    case "CARRO":
    case "CAR_HATCH":
    case "CAR_SEDAN":
    case "CAR_SW":
    case "OTHER":
      return "CAR";
    case "MOTO":
    case "MOTO_WITHOUT_BAG":
      return "MOTO";
    case "MOTO_WITH_BAG":
    case "MOTO_COM_BAG":
      return "MOTO_WITH_BAG";
    default:
      return null;
  }
}
function normalizeNeighborhoodName(name) {
  if (!name) return "";
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
}
var init_types = __esm({
  "src/server/types.ts"() {
  }
});

// src/server/eligibility.ts
function canReceiveDeliveryOffers(driver) {
  return driver.status === "ACTIVE";
}
function canReceiveRouteOffer(driver, route) {
  if (!canReceiveDeliveryOffers(driver)) return false;
  if (!route.accepted_vehicle_types || route.accepted_vehicle_types.length === 0) return true;
  const driverVehicles = parseDriverVehicleTypes(driver.vehicle_type);
  if (driverVehicles.length === 0) return false;
  for (const dv of driverVehicles) {
    if (route.accepted_vehicle_types.includes(dv)) return true;
    const dCat = mapVehicleTypeToPricingCategory(dv);
    const matchesCategory = route.accepted_vehicle_types.some((t) => {
      const rCat = mapVehicleTypeToPricingCategory(t);
      return rCat && rCat === dCat;
    });
    if (matchesCategory) return true;
  }
  return false;
}
var init_eligibility = __esm({
  "src/server/eligibility.ts"() {
    init_types();
  }
});

// src/server/pixValidation.ts
function validateAndNormalizeCpf(input) {
  if (!input) return { isValid: false, error: "CPF n\xE3o informado." };
  const digits = input.replace(/\D/g, "");
  if (digits.length !== 11) {
    return { isValid: false, error: "O CPF deve conter exatamente 11 d\xEDgitos num\xE9ricos." };
  }
  if (/^(\d)\1{10}$/.test(digits)) {
    return { isValid: false, error: "CPF inv\xE1lido (d\xEDgitos repetidos)." };
  }
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(digits.charAt(i), 10) * (10 - i);
  }
  let rev = sum * 10 % 11;
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(digits.charAt(9), 10)) {
    return { isValid: false, error: "CPF inv\xE1lido (d\xEDgito verificador incorreto)." };
  }
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(digits.charAt(i), 10) * (11 - i);
  }
  rev = sum * 10 % 11;
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(digits.charAt(10), 10)) {
    return { isValid: false, error: "CPF inv\xE1lido (d\xEDgito verificador incorreto)." };
  }
  return { isValid: true, canonical: digits };
}
function validateAndNormalizePixPhone(input) {
  if (!input) return { isValid: false, error: "Telefone n\xE3o informado." };
  let cleaned = input.replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+55")) {
    cleaned = cleaned.substring(3);
  } else if (cleaned.startsWith("55") && (cleaned.length === 12 || cleaned.length === 13)) {
    cleaned = cleaned.substring(2);
  } else if (cleaned.startsWith("+")) {
    cleaned = cleaned.substring(1);
  }
  const digits = cleaned.replace(/\D/g, "");
  if (digits.length !== 10 && digits.length !== 11) {
    return { isValid: false, error: "N\xFAmero de telefone deve conter DDD e 8 ou 9 d\xEDgitos (ex: (34) 99999-9999)." };
  }
  const ddd = parseInt(digits.substring(0, 2), 10);
  if (isNaN(ddd) || ddd < 11 || ddd > 99) {
    return { isValid: false, error: "DDD inv\xE1lido." };
  }
  const canonical = `+55${digits}`;
  return { isValid: true, canonical };
}
function validateAndNormalizePixEmail(input) {
  if (!input) return { isValid: false, error: "E-mail n\xE3o informado." };
  const trimmed = input.trim().toLowerCase();
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  if (trimmed.length > 254 || !emailRegex.test(trimmed)) {
    return { isValid: false, error: "Formato de e-mail inv\xE1lido." };
  }
  return { isValid: true, canonical: trimmed };
}
function validateAndNormalizePixRandom(input) {
  if (!input) return { isValid: false, error: "Chave aleat\xF3ria n\xE3o informada." };
  const trimmed = input.trim().toLowerCase();
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  if (!uuidRegex.test(trimmed)) {
    return { isValid: false, error: "Chave aleat\xF3ria inv\xE1lida. Deve seguir o formato UUID (ex: 123e4567-e89b-12d3-a456-426614174000)." };
  }
  return { isValid: true, canonical: trimmed };
}
function validateAndNormalizePix(type, value) {
  if (!type || !["CPF", "PHONE", "EMAIL", "RANDOM"].includes(type)) {
    return { isValid: false, error: `Tipo de chave Pix inv\xE1lido: '${type}'. Tipos aceitos: CPF, PHONE, EMAIL, RANDOM.` };
  }
  if (type === "CPF") {
    return validateAndNormalizeCpf(value);
  }
  if (type === "PHONE") {
    return validateAndNormalizePixPhone(value);
  }
  if (type === "EMAIL") {
    return validateAndNormalizePixEmail(value);
  }
  if (type === "RANDOM") {
    return validateAndNormalizePixRandom(value);
  }
  return { isValid: false, error: "Tipo de chave Pix desconhecido." };
}
function maskPixKey(type, value) {
  if (!value || type === "REQUIRES_UPDATE" || !type) {
    return "\u26A0\uFE0F Requer atualiza\xE7\xE3o";
  }
  const trimmed = value.trim();
  if (type === "CPF") {
    const digits = trimmed.replace(/\D/g, "");
    if (digits.length >= 11) {
      const lastTwo = digits.slice(-2);
      return `\u2022\u2022\u2022.\u2022\u2022\u2022.\u2022\u2022\u2022-${lastTwo}`;
    }
    return `\u2022\u2022\u2022.\u2022\u2022\u2022.\u2022\u2022\u2022-${digits.slice(-2) || "XX"}`;
  }
  if (type === "PHONE") {
    const digits = trimmed.replace(/\D/g, "");
    if (digits.length >= 12) {
      const ddd = digits.slice(2, 4);
      const last4 = digits.slice(-4);
      return `+55 ${ddd} *****-${last4}`;
    } else if (digits.length >= 10) {
      const ddd = digits.slice(0, 2);
      const last4 = digits.slice(-4);
      return `+55 ${ddd} *****-${last4}`;
    }
    return `+55 ** *****-${digits.slice(-4) || "****"}`;
  }
  if (type === "EMAIL") {
    const parts = trimmed.split("@");
    if (parts.length === 2) {
      const name = parts[0];
      const domain = parts[1];
      const initial = name.length > 0 ? name[0] : "";
      return `${initial}***@${domain}`;
    }
    return "***@***";
  }
  if (type === "RANDOM") {
    if (trimmed.length >= 4) {
      const last4 = trimmed.slice(-4);
      return `********-****-****-****-********${last4}`;
    }
    return "********-****-****-****-************";
  }
  return "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";
}
function normalizeGeneralPhone(input) {
  if (!input) return "";
  const digits = input.replace(/\D/g, "");
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  } else if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return input.trim();
}
var init_pixValidation = __esm({
  "src/server/pixValidation.ts"() {
  }
});

// src/server/mapsNavigation.ts
function buildGoogleMapsDestinationUrl(destination, travelmode = "driving") {
  if (!destination || typeof destination !== "string" || destination.trim().length === 0) {
    return null;
  }
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("destination", destination.trim());
  url.searchParams.set("travelmode", travelmode);
  return url.toString();
}
function buildGoogleMapsDirectionsUrl(origin, stops, travelmode = "driving") {
  if (!origin || typeof origin !== "string" || origin.trim().length === 0) {
    return null;
  }
  if (!Array.isArray(stops) || stops.length === 0) {
    return null;
  }
  if (stops.length > 4) {
    return null;
  }
  const sortedStops = [...stops].sort((a, b) => a.sequence - b.sequence);
  for (const s of sortedStops) {
    if (!s.destination_address || typeof s.destination_address !== "string" || s.destination_address.trim().length === 0) {
      console.warn(`[Google Maps] Falha ao construir rota geral: parada seq ${s.sequence} sem endere\xE7o v\xE1lido.`);
      return null;
    }
  }
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("origin", origin.trim());
  if (sortedStops.length === 1) {
    url.searchParams.set("destination", sortedStops[0].destination_address.trim());
  } else {
    const intermediateStops = sortedStops.slice(0, sortedStops.length - 1);
    const finalStop = sortedStops[sortedStops.length - 1];
    const waypointsStr = intermediateStops.map((s) => s.destination_address.trim()).join("|");
    url.searchParams.set("waypoints", waypointsStr);
    url.searchParams.set("destination", finalStop.destination_address.trim());
  }
  url.searchParams.set("travelmode", travelmode);
  return url.toString();
}
function generateRouteNavigationLinks(route) {
  const pickupAddress = route.pickup_address?.trim() || "";
  const stops = (route.stops || []).map((s) => ({
    id: "id" in s ? s.id : void 0,
    sequence: s.sequence,
    destination_address: s.destination_address,
    status: "status" in s ? s.status : void 0
  }));
  stops.sort((a, b) => a.sequence - b.sequence);
  const pickupUrl = pickupAddress ? buildGoogleMapsDestinationUrl(pickupAddress) : null;
  const maxStopsExceeded = stops.length > 4;
  let generalRouteUrl = null;
  let message = void 0;
  if (maxStopsExceeded) {
    generalRouteUrl = null;
    message = "Esta rota possui v\xE1rias entregas. Utilize a navega\xE7\xE3o dispon\xEDvel em cada parada.";
  } else if (stops.length > 0 && pickupAddress) {
    generalRouteUrl = buildGoogleMapsDirectionsUrl(pickupAddress, stops);
  }
  const stopUrls = stops.map((s) => ({
    stopId: s.id,
    sequence: s.sequence,
    url: s.destination_address ? buildGoogleMapsDestinationUrl(s.destination_address) : null
  }));
  return {
    generalRouteUrl,
    pickupUrl,
    stopUrls,
    maxStopsExceeded,
    message
  };
}
var init_mapsNavigation = __esm({
  "src/server/mapsNavigation.ts"() {
  }
});

// src/server/deliveryConfigService.ts
import { eq, and, asc } from "drizzle-orm";
var DeliveryConfigService, deliveryConfigService;
var init_deliveryConfigService = __esm({
  "src/server/deliveryConfigService.ts"() {
    init_db();
    init_schema();
    init_types();
    DeliveryConfigService = class {
      // ==========================================
      // 1. Modalidades de Entrega (M4.2 Parte B)
      // ==========================================
      async getModalities(activeOnly = false) {
        let query = db.select().from(deliveryModalities);
        if (activeOnly) {
          return await query.where(eq(deliveryModalities.active, true)).orderBy(asc(deliveryModalities.name));
        }
        return await query.orderBy(asc(deliveryModalities.name));
      }
      async getModalityByCode(code) {
        const rows = await db.select().from(deliveryModalities).where(eq(deliveryModalities.code, code.trim().toUpperCase()));
        return rows[0] || null;
      }
      async createModality(data) {
        const code = data.code.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");
        const name = data.name.trim();
        if (!code || !name) {
          throw new Error("INVALID_MODALITY_DATA: Nome e c\xF3digo s\xE3o obrigat\xF3rios");
        }
        const existing = await this.getModalityByCode(code);
        if (existing) {
          throw new Error("MODALITY_CODE_ALREADY_EXISTS: J\xE1 existe uma modalidade com este c\xF3digo");
        }
        const [row] = await db.insert(deliveryModalities).values({
          name,
          code,
          active: true
        }).returning();
        return row;
      }
      async updateModality(id, data) {
        const updateValues = { updated_at: /* @__PURE__ */ new Date() };
        if (data.name !== void 0) updateValues.name = data.name.trim();
        if (data.active !== void 0) updateValues.active = data.active;
        const [updated] = await db.update(deliveryModalities).set(updateValues).where(eq(deliveryModalities.id, id)).returning();
        if (!updated) throw new Error("MODALITY_NOT_FOUND");
        return updated;
      }
      // ==========================================
      // 2. Bairros e Normalização (M4.2 Parte D)
      // ==========================================
      async getNeighborhoods(activeOnly = false) {
        let query = db.select().from(neighborhoods);
        if (activeOnly) {
          return await query.where(eq(neighborhoods.active, true)).orderBy(asc(neighborhoods.name));
        }
        return await query.orderBy(asc(neighborhoods.name));
      }
      async getNeighborhoodById(id) {
        const rows = await db.select().from(neighborhoods).where(eq(neighborhoods.id, id));
        return rows[0] || null;
      }
      async getNeighborhoodByNormalizedName(normalizedName) {
        const rows = await db.select().from(neighborhoods).where(eq(neighborhoods.normalized_name, normalizedName));
        return rows[0] || null;
      }
      async findOrCreateNeighborhood(name) {
        const trimmed = name.trim();
        const normalized = normalizeNeighborhoodName(trimmed);
        if (!normalized) throw new Error("INVALID_NEIGHBORHOOD_NAME");
        const existing = await this.getNeighborhoodByNormalizedName(normalized);
        if (existing) return existing;
        const [row] = await db.insert(neighborhoods).values({
          name: trimmed,
          normalized_name: normalized,
          active: true
        }).returning();
        return row;
      }
      async createNeighborhood(name) {
        const trimmed = name.trim();
        const normalized = normalizeNeighborhoodName(trimmed);
        if (!trimmed || !normalized) {
          throw new Error("INVALID_NEIGHBORHOOD_NAME: Nome do bairro \xE9 obrigat\xF3rio");
        }
        const existing = await this.getNeighborhoodByNormalizedName(normalized);
        if (existing) {
          throw new Error(`NEIGHBORHOOD_ALREADY_EXISTS: O bairro "${existing.name}" j\xE1 est\xE1 cadastrado`);
        }
        const [row] = await db.insert(neighborhoods).values({
          name: trimmed,
          normalized_name: normalized,
          active: true
        }).returning();
        return row;
      }
      async updateNeighborhood(id, data) {
        const updateValues = { updated_at: /* @__PURE__ */ new Date() };
        if (data.name !== void 0) {
          updateValues.name = data.name.trim();
          updateValues.normalized_name = normalizeNeighborhoodName(data.name.trim());
        }
        if (data.active !== void 0) updateValues.active = data.active;
        const [updated] = await db.update(neighborhoods).set(updateValues).where(eq(neighborhoods.id, id)).returning();
        if (!updated) throw new Error("NEIGHBORHOOD_NOT_FOUND");
        return updated;
      }
      // ==========================================
      // 3. Configurações de Entrega (M4.2 Parte G & H)
      // ==========================================
      async getDeliveryConfig() {
        const rows = await db.select().from(deliveryConfigurations);
        const map = new Map(rows.map((r) => [r.key, r.value]));
        const managementRateStr = map.get("LOGISTICS_MANAGEMENT_RATE") || "0.10";
        const routeDiscountStr = map.get("DEFAULT_ROUTE_DISCOUNT_PERCENT") || "0.20";
        return {
          logistics_management_rate: parseFloat(managementRateStr) || 0.1,
          default_route_discount_percent: parseFloat(routeDiscountStr) || 0.2
        };
      }
      async updateDeliveryConfig(key, value) {
        const numValue = typeof value === "number" ? value : parseFloat(value.replace(",", "."));
        if (isNaN(numValue) || numValue < 0 || numValue > 1) {
          throw new Error("INVALID_CONFIG_VALUE: O percentual deve ser um decimal entre 0 e 1 (ex: 0.10 para 10%)");
        }
        await db.insert(deliveryConfigurations).values({
          key,
          value: numValue.toFixed(4),
          updated_at: /* @__PURE__ */ new Date()
        }).onConflictDoUpdate({
          target: deliveryConfigurations.key,
          set: {
            value: numValue.toFixed(4),
            updated_at: /* @__PURE__ */ new Date()
          }
        });
        return this.getDeliveryConfig();
      }
      // ==========================================
      // 4. Tabela de Fretes / Matriz Tarifária (M4.2 Parte E)
      // ==========================================
      async getFreightPrices(filters) {
        let query = db.select({
          id: freightPrices.id,
          neighborhood_id: freightPrices.neighborhood_id,
          modality_code: freightPrices.modality_code,
          vehicle_category: freightPrices.vehicle_category,
          price: freightPrices.price,
          active: freightPrices.active,
          created_at: freightPrices.created_at,
          updated_at: freightPrices.updated_at,
          neighborhood_name: neighborhoods.name
        }).from(freightPrices).leftJoin(neighborhoods, eq(freightPrices.neighborhood_id, neighborhoods.id));
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
        const rows = conditions.length > 0 ? await query.where(and(...conditions)).orderBy(asc(neighborhoods.name)) : await query.orderBy(asc(neighborhoods.name));
        return rows.map((r) => ({
          ...r,
          price: parseFloat(String(r.price)),
          vehicle_category: r.vehicle_category,
          neighborhood_name: r.neighborhood_name || void 0
        }));
      }
      async upsertFreightPrice(data) {
        if (!["CAR", "MOTO", "MOTO_WITH_BAG"].includes(data.vehicle_category)) {
          throw new Error(`INVALID_VEHICLE_CATEGORY: Categoria tarif\xE1ria inv\xE1lida: ${data.vehicle_category}`);
        }
        if (isNaN(data.price) || data.price < 0) {
          throw new Error("INVALID_PRICE: Pre\xE7o inv\xE1lido");
        }
        const existing = await db.select().from(freightPrices).where(
          and(
            eq(freightPrices.neighborhood_id, data.neighborhood_id),
            eq(freightPrices.modality_code, data.modality_code),
            eq(freightPrices.vehicle_category, data.vehicle_category)
          )
        );
        if (existing.length > 0) {
          const [updated] = await db.update(freightPrices).set({
            price: data.price.toFixed(2),
            active: data.active !== void 0 ? data.active : true,
            updated_at: /* @__PURE__ */ new Date()
          }).where(eq(freightPrices.id, existing[0].id)).returning();
          return {
            ...updated,
            price: parseFloat(String(updated.price)),
            vehicle_category: updated.vehicle_category
          };
        }
        const [inserted] = await db.insert(freightPrices).values({
          neighborhood_id: data.neighborhood_id,
          modality_code: data.modality_code,
          vehicle_category: data.vehicle_category,
          price: data.price.toFixed(2),
          active: data.active !== void 0 ? data.active : true
        }).returning();
        return {
          ...inserted,
          price: parseFloat(String(inserted.price)),
          vehicle_category: inserted.vehicle_category
        };
      }
      /**
       * Buscar preço sugerido de referência na matriz tarifária
       */
      async getSuggestedFreightPrice(neighborhoodIdOrName, modalityCode, vehicleCategory) {
        let neighborhoodId = null;
        if (typeof neighborhoodIdOrName === "number") {
          neighborhoodId = neighborhoodIdOrName;
        } else {
          const norm = normalizeNeighborhoodName(neighborhoodIdOrName);
          const n = await this.getNeighborhoodByNormalizedName(norm);
          if (n) neighborhoodId = n.id;
        }
        if (!neighborhoodId) {
          return { price: 0, source: "NONE" };
        }
        const rows = await db.select().from(freightPrices).where(
          and(
            eq(freightPrices.neighborhood_id, neighborhoodId),
            eq(freightPrices.modality_code, modalityCode),
            eq(freightPrices.vehicle_category, vehicleCategory),
            eq(freightPrices.active, true)
          )
        );
        if (rows.length > 0) {
          return { price: parseFloat(String(rows[0].price)), source: "TABLE" };
        }
        return { price: 0, source: "NONE" };
      }
      // ==========================================
      // 5. Cálculo Financeiro de Rota (M4.2 Parte G & H)
      // ==========================================
      calculateRoutePricing(stops, rates) {
        const managementRate = rates?.logistics_management_rate !== void 0 ? rates.logistics_management_rate : 0.1;
        const discountPercent = rates?.default_route_discount_percent !== void 0 ? rates.default_route_discount_percent : 0.2;
        let customerFreightTotal = 0;
        let managementAmountTotal = 0;
        let routeBaseAmount = 0;
        const stopsBreakdown = stops.map((s) => {
          const freight = Math.round(s.customer_freight * 100) / 100;
          const netBase = Math.round(freight / (1 + managementRate) * 100) / 100;
          const mgmt = Math.round((freight - netBase) * 100) / 100;
          customerFreightTotal += freight;
          managementAmountTotal += mgmt;
          routeBaseAmount += netBase;
          return {
            customer_freight: freight,
            net_delivery_base: netBase,
            management_amount: mgmt
          };
        });
        customerFreightTotal = Math.round(customerFreightTotal * 100) / 100;
        managementAmountTotal = Math.round(managementAmountTotal * 100) / 100;
        routeBaseAmount = Math.round(routeBaseAmount * 100) / 100;
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
          suggested_driver_fee: suggestedDriverFee
        };
      }
    };
    deliveryConfigService = new DeliveryConfigService();
  }
});

// src/shared/customerUtils.ts
function computeAcceptedFinalDeadline(desiredDurationOrDeadline, acceptedAtDate = /* @__PURE__ */ new Date()) {
  const str = (desiredDurationOrDeadline || "").trim();
  if (/^\d{1,2}:\d{2}$/.test(str)) {
    return str;
  }
  if (/^\d{1,2}:\d{2}\s*\(.*\)$/.test(str)) {
    return str;
  }
  let minutesToAdd = 50;
  const match = str.match(/^(\d+)\s*(?:min|minutos|m)?$/i);
  if (match) {
    const parsed = parseInt(match[1], 10);
    if (!isNaN(parsed) && parsed > 0 && parsed <= 360) {
      minutesToAdd = parsed;
    }
  }
  const targetDate = new Date(acceptedAtDate.getTime() + minutesToAdd * 60 * 1e3);
  const timeFormatted = targetDate.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo"
  });
  return `${timeFormatted} (${minutesToAdd} min ap\xF3s aceite)`;
}
var init_customerUtils = __esm({
  "src/shared/customerUtils.ts"() {
  }
});

// src/server/routeService.ts
import { eq as eq2, desc as desc2, asc as asc2, and as and2, or, isNotNull, sql as sql3 } from "drizzle-orm";
var RouteService, routeService;
var init_routeService = __esm({
  "src/server/routeService.ts"() {
    init_db();
    init_schema();
    init_eligibility();
    init_telegramBot();
    init_driverService();
    init_deliveryConfigService();
    init_mapsNavigation();
    init_customerUtils();
    RouteService = class {
      // ==========================================
      // Pickup Locations Management (M2.1 Seção 12)
      // ==========================================
      async getPickupLocations() {
        const rows = await db.select().from(pickupLocations).orderBy(asc2(pickupLocations.name));
        return rows;
      }
      async getPickupLocationById(id) {
        const rows = await db.select().from(pickupLocations).where(eq2(pickupLocations.id, id));
        if (rows.length === 0) return null;
        return rows[0];
      }
      async createPickupLocation(data) {
        if (!data.name?.trim() || !data.address?.trim()) {
          throw new Error("MISSING_PICKUP_LOCATION_FIELDS");
        }
        const [created] = await db.insert(pickupLocations).values({
          name: data.name.trim(),
          address: data.address.trim(),
          neighborhood: data.neighborhood?.trim() || null,
          active: data.active !== void 0 ? Boolean(data.active) : true
        }).returning();
        return created;
      }
      async updatePickupLocation(id, data) {
        const existing = await this.getPickupLocationById(id);
        if (!existing) throw new Error("PICKUP_LOCATION_NOT_FOUND");
        const updatePayload = { updated_at: /* @__PURE__ */ new Date() };
        if (data.name !== void 0) updatePayload.name = data.name.trim();
        if (data.address !== void 0) updatePayload.address = data.address.trim();
        if (data.neighborhood !== void 0) {
          updatePayload.neighborhood = data.neighborhood ? data.neighborhood.trim() : null;
        }
        if (data.active !== void 0) updatePayload.active = Boolean(data.active);
        const [updated] = await db.update(pickupLocations).set(updatePayload).where(eq2(pickupLocations.id, id)).returning();
        return updated;
      }
      // ==========================================
      // Route Operations (M2.1 Seção 5 - 18)
      // ==========================================
      /**
       * Parse DB route stop row to domain model
       */
      parseRouteStopRow(row) {
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
          incident_resolution_status: row.incident_resolution_status || (row.status === "INCIDENT" ? "OPEN" : null),
          resolution_type: row.resolution_type || null,
          resolution_note: row.resolution_note || null,
          resolved_at: row.resolved_at || null,
          resolved_by: row.resolved_by || null,
          compensation_amount: row.compensation_amount != null ? parseFloat(String(row.compensation_amount)) : null,
          // M4.2 Modality, Neighborhood, Pricing Category & Customer Freight
          modality_code: row.modality_code || "CONVENCIONAL",
          neighborhood_id: row.neighborhood_id || null,
          pricing_vehicle_category: row.pricing_vehicle_category || null,
          customer_freight: row.customer_freight != null ? parseFloat(String(row.customer_freight)) : null,
          net_delivery_base: row.net_delivery_base != null ? parseFloat(String(row.net_delivery_base)) : null,
          management_amount: row.management_amount != null ? parseFloat(String(row.management_amount)) : null,
          is_horizontal_condo: Boolean(
            row.is_horizontal_condo || typeof row.observations === "string" && row.observations.includes("[Condom\xEDnio Horizontal]")
          ),
          created_at: row.created_at,
          completed_at: row.completed_at
        };
      }
      /**
       * Parse DB route row to domain model
       */
      parseRouteRow(row, stops, driver) {
        let acceptedVehicles = [];
        try {
          acceptedVehicles = typeof row.accepted_vehicle_types === "string" ? JSON.parse(row.accepted_vehicle_types) : row.accepted_vehicle_types || [];
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
          payment_status: row.payment_status || "PENDING",
          paid_at: row.paid_at,
          paid_by: row.paid_by,
          payment_method: row.payment_method || "PIX",
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
          // M4.4 Versionamento e Edição Controlada
          route_version: row.route_version != null ? Number(row.route_version) : 1,
          driver_acknowledged_version: row.driver_acknowledged_version != null ? Number(row.driver_acknowledged_version) : 1,
          change_pending_driver_approval: Boolean(row.change_pending_driver_approval),
          pending_material_change: row.pending_material_change || null,
          created_at: row.created_at,
          offered_at: row.offered_at,
          stops,
          accepted_driver: driver || void 0
        };
      }
      /**
       * M4.2 Privacy Filter: Removes all internal financial and customer margins before returning to driver
       */
      sanitizeRouteForDriver(route) {
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
            return driverSafeStop;
          });
        }
        return driverSafeRoute;
      }
      /**
       * Create a route as DRAFT with 1..N stops
       * Never sends Telegram messages in DRAFT
       */
      async createDraft(data, actor) {
        if (!data.final_deadline?.trim()) {
          throw new Error("MISSING_FINAL_DEADLINE");
        }
        if (!Array.isArray(data.accepted_vehicle_types) || data.accepted_vehicle_types.length === 0) {
          throw new Error("AT_LEAST_ONE_VEHICLE_TYPE_REQUIRED");
        }
        if (!Array.isArray(data.stops) || data.stops.length === 0) {
          throw new Error("AT_LEAST_ONE_STOP_REQUIRED");
        }
        for (let i = 0; i < data.stops.length; i++) {
          const stop = data.stops[i];
          if (!stop.destination_address?.trim() || !stop.destination_neighborhood?.trim() || !stop.cargo_description?.trim()) {
            throw new Error(`MISSING_FIELDS_ON_STOP_${i + 1}`);
          }
        }
        let pickupName = "";
        let pickupAddress = "";
        let pickupNeighborhoodSnapshot = null;
        let pickupLocationId = null;
        if (data.pickup_type === "REGISTERED") {
          if (!data.pickup_location_id) {
            throw new Error("MISSING_PICKUP_LOCATION_ID");
          }
          const loc = await this.getPickupLocationById(data.pickup_location_id);
          if (!loc) {
            throw new Error("PICKUP_LOCATION_NOT_FOUND");
          }
          pickupLocationId = loc.id;
          pickupName = loc.name;
          pickupAddress = loc.address;
          pickupNeighborhoodSnapshot = loc.neighborhood?.trim() || null;
        } else {
          if (!data.pickup_name?.trim() || !data.pickup_address?.trim()) {
            throw new Error("MISSING_AD_HOC_PICKUP_INFO");
          }
          pickupName = data.pickup_name.trim();
          pickupAddress = data.pickup_address.trim();
          const adHocNeighborhood = (data.pickup_neighborhood || data.pickup_neighborhood_snapshot)?.trim();
          pickupNeighborhoodSnapshot = adHocNeighborhood || null;
        }
        const config = await deliveryConfigService.getDeliveryConfig();
        const managementRate = data.management_rate_snapshot !== void 0 ? data.management_rate_snapshot : config.logistics_management_rate;
        const discountPercent = data.route_discount_percent_snapshot !== void 0 ? data.route_discount_percent_snapshot : config.default_route_discount_percent;
        const stopsCalc = data.stops.map((s) => {
          let customerFreight = 0;
          if (s.customer_freight !== void 0 && s.customer_freight !== null && s.customer_freight !== "") {
            customerFreight = typeof s.customer_freight === "number" ? s.customer_freight : parseFloat(String(s.customer_freight).replace(",", "."));
          }
          customerFreight = Math.round((customerFreight || 0) * 100) / 100;
          let netBase = 0;
          let mgmtAmount = 0;
          if (customerFreight > 0) {
            netBase = Math.round(customerFreight / (1 + managementRate) * 100) / 100;
            mgmtAmount = Math.round((customerFreight - netBase) * 100) / 100;
          }
          return {
            customer_freight: customerFreight,
            net_delivery_base: netBase,
            management_amount: mgmtAmount
          };
        });
        const sumCustomerFreight = Math.round(stopsCalc.reduce((acc, s) => acc + s.customer_freight, 0) * 100) / 100;
        const sumMgmtAmount = Math.round(stopsCalc.reduce((acc, s) => acc + s.management_amount, 0) * 100) / 100;
        const sumBaseAmount = Math.round(stopsCalc.reduce((acc, s) => acc + s.net_delivery_base, 0) * 100) / 100;
        let calculatedSuggested = 0;
        if (data.stops.length > 1) {
          calculatedSuggested = Math.round(sumBaseAmount * (1 - discountPercent) * 100) / 100;
        } else {
          calculatedSuggested = sumBaseAmount;
        }
        const customerFreightTotal = data.customer_freight_total != null ? parseFloat(String(data.customer_freight_total).replace(",", ".")) : sumCustomerFreight;
        const managementAmountTotal = data.management_amount_total != null ? parseFloat(String(data.management_amount_total).replace(",", ".")) : sumMgmtAmount;
        const routeBaseAmount = data.route_base_amount != null ? parseFloat(String(data.route_base_amount).replace(",", ".")) : sumBaseAmount;
        const suggestedDriverFee = data.suggested_driver_fee != null ? parseFloat(String(data.suggested_driver_fee).replace(",", ".")) : calculatedSuggested;
        let finalDriverFee = suggestedDriverFee;
        if (data.final_driver_fee != null && data.final_driver_fee !== "") {
          finalDriverFee = parseFloat(String(data.final_driver_fee).replace(",", "."));
        } else if (data.total_fee?.trim()) {
          const parsed = parseFloat(data.total_fee.replace(",", "."));
          if (!isNaN(parsed) && parsed > 0) {
            finalDriverFee = parsed;
          }
        }
        if (customerFreightTotal > 0 && Math.abs(finalDriverFee - suggestedDriverFee) > 9e-3 && !data.override_reason?.trim()) {
          throw new Error("OVERRIDE_REASON_REQUIRED: O motivo do ajuste \xE9 obrigat\xF3rio quando o frete final do motorista difere do sugerido");
        }
        const formattedTotalFee = finalDriverFee.toFixed(2).replace(".", ",");
        const [newRouteRow] = await db.insert(routes).values({
          pickup_type: data.pickup_type,
          pickup_location_id: pickupLocationId,
          pickup_name: pickupName,
          pickup_address: pickupAddress,
          pickup_neighborhood_snapshot: pickupNeighborhoodSnapshot,
          final_deadline: data.final_deadline.trim(),
          total_fee: formattedTotalFee,
          accepted_vehicle_types: JSON.stringify(data.accepted_vehicle_types),
          status: "DRAFT",
          // M4.2 Snapshots & Financeiro
          customer_freight_total: customerFreightTotal > 0 ? customerFreightTotal.toFixed(2) : null,
          management_rate_snapshot: managementRate.toFixed(4),
          management_amount_total: managementAmountTotal > 0 ? managementAmountTotal.toFixed(2) : null,
          route_base_amount: routeBaseAmount > 0 ? routeBaseAmount.toFixed(2) : null,
          route_discount_percent_snapshot: discountPercent.toFixed(4),
          suggested_driver_fee: suggestedDriverFee > 0 ? suggestedDriverFee.toFixed(2) : null,
          final_driver_fee: finalDriverFee > 0 ? finalDriverFee.toFixed(2) : null,
          override_reason: data.override_reason?.trim() || null
        }).returning();
        const insertedStops = [];
        const usedPins = /* @__PURE__ */ new Set();
        for (let i = 0; i < data.stops.length; i++) {
          const s = data.stops[i];
          let pin = String(Math.floor(1e3 + Math.random() * 9e3));
          while (usedPins.has(pin)) {
            pin = String(Math.floor(1e3 + Math.random() * 9e3));
          }
          usedPins.add(pin);
          const [newStop] = await db.insert(routeStops).values({
            route_id: newRouteRow.id,
            sequence: i + 1,
            destination_address: s.destination_address.trim(),
            destination_neighborhood: s.destination_neighborhood.trim(),
            cargo_description: s.cargo_description.trim(),
            delivery_mode: s.delivery_mode === "NO_CONTACT" ? "NO_CONTACT" : "IN_PERSON",
            observations: (() => {
              let obs = s.observations?.trim() || "";
              if (s.is_horizontal_condo && !obs.includes("[Condom\xEDnio Horizontal]")) {
                obs = obs ? `[Condom\xEDnio Horizontal] ${obs}` : "[Condom\xEDnio Horizontal]";
              }
              return obs || null;
            })(),
            desired_deadline: s.desired_deadline?.trim() || null,
            status: "PENDING",
            pin_code: pin,
            // M4.2 Modality, Neighborhood, Pricing Category & Customer Freight
            modality_code: s.modality_code?.trim().toUpperCase() || "CONVENCIONAL",
            neighborhood_id: s.neighborhood_id || null,
            pricing_vehicle_category: s.pricing_vehicle_category || null,
            customer_freight: stopsCalc[i].customer_freight > 0 ? stopsCalc[i].customer_freight.toFixed(2) : null,
            net_delivery_base: stopsCalc[i].net_delivery_base > 0 ? stopsCalc[i].net_delivery_base.toFixed(2) : null,
            management_amount: stopsCalc[i].management_amount > 0 ? stopsCalc[i].management_amount.toFixed(2) : null
          }).returning();
          insertedStops.push(this.parseRouteStopRow(newStop));
        }
        await db.insert(routeEvents).values({
          route_id: newRouteRow.id,
          event_type: "ROUTE_CREATED",
          actor: actor || "ADMIN",
          details: `Created with ${insertedStops.length} stop(s). Final driver fee: R$ ${formattedTotalFee}. Pickup: ${pickupName}`
        });
        return this.parseRouteRow(newRouteRow, insertedStops);
      }
      async getRouteById(id) {
        const rows = await db.select().from(routes).where(eq2(routes.id, id));
        if (rows.length === 0) return null;
        const stopsRows = await db.select().from(routeStops).where(eq2(routeStops.route_id, id)).orderBy(asc2(routeStops.sequence));
        let driver = null;
        if (rows[0].accepted_driver_id) {
          driver = await driverService.getDriverById(rows[0].accepted_driver_id).catch(() => null);
        }
        return this.parseRouteRow(rows[0], stopsRows.map((s) => this.parseRouteStopRow(s)), driver);
      }
      async getRoutes(status) {
        let query = db.select().from(routes);
        if (status) {
          query = query.where(eq2(routes.status, status));
        }
        const rows = await query.orderBy(desc2(routes.id));
        const allStops = await db.select().from(routeStops).orderBy(asc2(routeStops.sequence));
        const stopsByRouteId = /* @__PURE__ */ new Map();
        for (const stop of allStops) {
          const list = stopsByRouteId.get(stop.route_id) || [];
          list.push(stop);
          stopsByRouteId.set(stop.route_id, list);
        }
        const allDrivers = await driverService.getDrivers().catch(() => []);
        const driversMap = /* @__PURE__ */ new Map();
        for (const d of allDrivers) {
          driversMap.set(d.id, d);
        }
        return rows.map((r) => {
          const drv = r.accepted_driver_id ? driversMap.get(r.accepted_driver_id) || null : null;
          return this.parseRouteRow(r, stopsByRouteId.get(r.id) || [], drv);
        });
      }
      async getRouteDetails(id) {
        const route = await this.getRouteById(id);
        if (!route) throw new Error("ROUTE_NOT_FOUND");
        let driver = null;
        if (route.accepted_driver_id) {
          driver = await driverService.getDriverById(route.accepted_driver_id).catch(() => null);
          route.accepted_driver = driver || void 0;
        }
        const dispatchesRows = await db.select().from(routeOfferDispatches).where(eq2(routeOfferDispatches.route_id, id));
        const eventsRows = await db.select().from(routeEvents).where(eq2(routeEvents.route_id, id)).orderBy(desc2(routeEvents.timestamp));
        const sent = dispatchesRows.filter((d) => d.status === "SENT").length;
        const failed = dispatchesRows.filter((d) => d.status === "FAILED").length;
        return {
          route,
          driver,
          dispatches: dispatchesRows,
          events: eventsRows,
          stats: { sent, failed }
        };
      }
      /**
       * Update Route Vehicle Types directly (for DRAFT and OFFERED routes)
       */
      async updateRouteVehicleTypes(routeId, vehicleTypes, actor = "ADMIN") {
        const route = await this.getRouteById(routeId);
        if (!route) throw new Error("ROUTE_NOT_FOUND");
        await db.update(routes).set({
          accepted_vehicle_types: JSON.stringify(vehicleTypes)
        }).where(eq2(routes.id, routeId));
        await db.insert(routeEvents).values({
          route_id: routeId,
          event_type: "ROUTE_UPDATED",
          actor: actor || "ADMIN",
          details: `Ve\xEDculos aceit\xE1veis atualizados para: ${vehicleTypes.join(", ")}`
        });
        return await this.getRouteById(routeId);
      }
      /**
       * Publish Route: DRAFT -> OFFERED
       * Filters eligible drivers by ACTIVE status AND vehicle compatibility.
       */
      async publishRoute(id, actor, options) {
        const route = await this.getRouteById(id);
        if (!route) throw new Error("ROUTE_NOT_FOUND");
        if (route.status === "OFFERED" && !options?.isRepublish) {
          throw new Error("ROUTE_ALREADY_OFFERED");
        }
        if (route.status === "CANCELLED") {
          throw new Error("CANNOT_PUBLISH_CANCELLED_ROUTE");
        }
        if (route.status === "ACCEPTED") {
          throw new Error("CANNOT_PUBLISH_ACCEPTED_ROUTE");
        }
        let currentPickupNeighborhood = route.pickup_neighborhood_snapshot?.trim();
        if (options?.pickup_neighborhood?.trim()) {
          currentPickupNeighborhood = options.pickup_neighborhood.trim();
          await db.update(routes).set({ pickup_neighborhood_snapshot: currentPickupNeighborhood }).where(eq2(routes.id, id));
          route.pickup_neighborhood_snapshot = currentPickupNeighborhood;
        }
        if (!currentPickupNeighborhood) {
          if (route.pickup_type === "REGISTERED" && route.pickup_location_id) {
            const loc = await this.getPickupLocationById(route.pickup_location_id);
            if (loc?.neighborhood?.trim()) {
              currentPickupNeighborhood = loc.neighborhood.trim();
              await db.update(routes).set({ pickup_neighborhood_snapshot: currentPickupNeighborhood }).where(eq2(routes.id, id));
              route.pickup_neighborhood_snapshot = currentPickupNeighborhood;
            } else {
              throw new Error("NEIGHBORHOOD_REQUIRED_FOR_PUBLICATION: O ponto de coleta cadastrado n\xE3o possui bairro cadastrado. Complemente o cadastro do ponto com o bairro antes de publicar a rota.");
            }
          } else {
            throw new Error("NEIGHBORHOOD_REQUIRED_FOR_PUBLICATION: O bairro da retirada \xE9 obrigat\xF3rio para publicar a rota. Preencha o bairro da coleta.");
          }
        }
        const allDrivers = await driverService.getDrivers();
        const eligibleDrivers = allDrivers.filter((driver) => canReceiveRouteOffer(driver, route));
        if (eligibleDrivers.length === 0) {
          throw new Error("NO_ACTIVE_DRIVERS_AVAILABLE");
        }
        const [updatedRow] = await db.update(routes).set({
          status: "OFFERED",
          offered_at: /* @__PURE__ */ new Date()
        }).where(eq2(routes.id, id)).returning();
        await db.insert(routeEvents).values({
          route_id: id,
          event_type: "ROUTE_OFFERED",
          actor: actor || "ADMIN",
          details: `Dispatched to ${eligibleDrivers.length} eligible driver(s)`
        });
        const recordedDispatches = [];
        let sentCount = 0;
        let failedCount = 0;
        const freshRoute = await this.getRouteById(id);
        if (!freshRoute) throw new Error("ROUTE_NOT_FOUND_AFTER_UPDATE");
        for (const driver of eligibleDrivers) {
          try {
            const sendResult = await telegramBot.sendRouteOffer(
              driver.telegram_chat_id,
              freshRoute,
              driver.vehicle_type
            );
            const dispatchStatus = sendResult.success ? "SENT" : "FAILED";
            if (dispatchStatus === "SENT") {
              sentCount++;
            } else {
              failedCount++;
            }
            const [disp] = await db.insert(routeOfferDispatches).values({
              route_id: id,
              route_version: freshRoute.route_version || 1,
              driver_id: driver.id,
              telegram_chat_id: driver.telegram_chat_id,
              telegram_message_id: sendResult.messageId || null,
              status: dispatchStatus,
              error_code: sendResult.errorCode || null
            }).returning();
            recordedDispatches.push(disp);
          } catch (err) {
            failedCount++;
            try {
              const [disp] = await db.insert(routeOfferDispatches).values({
                route_id: id,
                route_version: freshRoute.route_version || 1,
                driver_id: driver.id,
                telegram_chat_id: driver.telegram_chat_id,
                status: "FAILED",
                error_code: err.message || "DISPATCH_EXCEPTION"
              }).returning();
              recordedDispatches.push(disp);
            } catch {
            }
          }
        }
        return {
          route: freshRoute,
          dispatches: recordedDispatches,
          stats: { sent: sentCount, failed: failedCount }
        };
      }
      /**
       * Cancel Route: Allows cancelling a route at ANY status (DRAFT, OFFERED, ACCEPTED, ARRIVED_PICKUP, PICKED_UP, IN_TRANSIT, COMPLETED).
       * Routes cancelled move into CANCELLED status.
       * When cancelled, pending stops or a cancellation incident are routed to Pendências (M4.1) so operations can track resolution, compensation, or store return.
       * If OFFERED, notifies all drivers who received SENT offer.
       * If ACCEPTED/IN_TRANSIT/etc with an allocated driver, notifies the driver via Telegram.
       */
      /** Atualiza o texto de prazo da rota (ex.: "Entregar às 16/11 15:00"). Só em rascunho. */
      async setFinalDeadlineText(id, text2) {
        await db.update(routes).set({ final_deadline: text2.slice(0, 120) }).where(and2(eq2(routes.id, id), eq2(routes.status, "DRAFT")));
      }
      async logRouteEvent(id, eventType, actor, details) {
        await db.insert(routeEvents).values({ route_id: id, event_type: eventType, actor, details });
      }
      /**
       * Exclui DE VEZ uma rota que nunca teve entregador (rascunho ou cancelada sem motorista).
       * Rotas que chegaram a ter motorista não podem ser excluídas (histórico financeiro/pendências).
       */
      async deleteRouteWithoutDriver(id) {
        const route = await this.getRouteById(id);
        if (!route) throw new Error("ROUTE_NOT_FOUND");
        if (route.accepted_driver_id) throw new Error("ROUTE_HAS_DRIVER");
        if (route.status !== "DRAFT" && route.status !== "CANCELLED") throw new Error("ROUTE_NOT_DELETABLE");
        await db.transaction(async (tx) => {
          await tx.delete(routeOfferDispatches).where(eq2(routeOfferDispatches.route_id, id));
          await tx.delete(routeUpdates).where(eq2(routeUpdates.route_id, id));
          await tx.delete(routeEvents).where(eq2(routeEvents.route_id, id));
          await tx.delete(routeStops).where(eq2(routeStops.route_id, id));
          await tx.update(takeatOrders).set({ created_route_id: null, status: "DISMISSED" }).where(eq2(takeatOrders.created_route_id, id));
          await tx.delete(routes).where(eq2(routes.id, id));
        });
      }
      async cancelRoute(id, actor, reason, options) {
        const route = await this.getRouteById(id);
        if (!route) throw new Error("ROUTE_NOT_FOUND");
        if (route.status === "CANCELLED") {
          throw new Error("ROUTE_ALREADY_CANCELLED");
        }
        const previousStatus = route.status;
        const cancelReason = reason?.trim() || `Cancelamento operacional pelo atendente (${previousStatus})`;
        const [updatedRow] = await db.update(routes).set({ status: "CANCELLED" }).where(eq2(routes.id, id)).returning();
        await db.insert(routeEvents).values({
          route_id: id,
          event_type: "ROUTE_CANCELLED",
          actor: actor || "ADMIN",
          details: `Status anterior: ${previousStatus}. Motivo: ${cancelReason}${options?.compensation_amount !== void 0 ? ` (Repasse acordado: R$ ${options.compensation_amount.toFixed(2)})` : ""}`
        });
        if (options?.compensation_amount !== void 0) {
          if (options.compensation_amount > 0) {
            await db.update(routes).set({
              total_fee: options.compensation_amount.toFixed(2),
              final_driver_fee: options.compensation_amount.toFixed(2),
              payment_status: "PENDING"
            }).where(eq2(routes.id, id));
          } else {
            await db.update(routes).set({
              total_fee: "0.00",
              final_driver_fee: "0.00",
              payment_status: "PAID",
              paid_at: /* @__PURE__ */ new Date(),
              paid_by: actor || "ADMIN",
              payment_note: "Isento de repasse - Cancelamento sem custo financeiro"
            }).where(eq2(routes.id, id));
          }
        }
        const stops = await db.select().from(routeStops).where(eq2(routeStops.route_id, id));
        const hadDriver = Boolean(route.accepted_driver_id);
        if (!hadDriver) {
          for (const stop of stops) {
            if (stop.status === "PENDING") {
              await db.update(routeStops).set({ status: "CANCELLED" }).where(eq2(routeStops.id, stop.id));
            }
          }
        } else {
          const now = /* @__PURE__ */ new Date();
          const resolutionStatus = options?.resolution_type ? "RESOLVED" : "OPEN";
          const resolutionType = options?.resolution_type || (options?.compensation_amount !== void 0 ? "CANCELLATION" : null);
          const resolutionNote = options?.resolution_note || (resolutionType ? cancelReason : null);
          const compensationAmountStr = options?.compensation_amount !== void 0 ? options.compensation_amount.toFixed(2) : null;
          if (stops.length === 0) {
            await db.insert(routeStops).values({
              route_id: id,
              sequence: 1,
              cargo_description: "Corrida Cancelada",
              destination_address: route.pickup_address || "Endere\xE7o da rota",
              destination_neighborhood: "Central",
              delivery_mode: "IN_PERSON",
              observations: `Corrida #${id} cancelada no status ${previousStatus}. Motivo: ${cancelReason}`,
              status: "INCIDENT",
              incident_type: "CORRIDA_CANCELADA",
              incident_note: `Corrida #${id} cancelada quando estava em status ${previousStatus}. Motivo: ${cancelReason}`,
              incident_at: now,
              incident_resolution_status: resolutionStatus,
              resolution_type: resolutionType,
              resolution_note: resolutionNote,
              resolved_at: options?.resolution_type ? now : null,
              resolved_by: options?.resolution_type ? actor || "ADMIN" : null,
              compensation_amount: compensationAmountStr
            });
          } else {
            let hasIncidentStops = false;
            for (const stop of stops) {
              if (stop.status === "PENDING") {
                hasIncidentStops = true;
                await db.update(routeStops).set({
                  status: "INCIDENT",
                  incident_type: "CORRIDA_CANCELADA",
                  incident_note: `Corrida #${id} cancelada quando estava em status ${previousStatus}. Motivo: ${cancelReason}`,
                  incident_at: now,
                  incident_resolution_status: resolutionStatus,
                  resolution_type: resolutionType,
                  resolution_note: resolutionNote,
                  resolved_at: options?.resolution_type ? now : null,
                  resolved_by: options?.resolution_type ? actor || "ADMIN" : null,
                  compensation_amount: compensationAmountStr
                }).where(eq2(routeStops.id, stop.id));
              }
            }
            if (!hasIncidentStops) {
              const targetStop = stops[stops.length - 1];
              await db.update(routeStops).set({
                status: "INCIDENT",
                incident_type: "CORRIDA_CANCELADA",
                incident_note: `Corrida #${id} cancelada retroativamente a partir do status ${previousStatus}. Tratativa necess\xE1ria: ${cancelReason}`,
                incident_at: now,
                incident_resolution_status: resolutionStatus,
                resolution_type: resolutionType,
                resolution_note: resolutionNote,
                resolved_at: options?.resolution_type ? now : null,
                resolved_by: options?.resolution_type ? actor || "ADMIN" : null,
                compensation_amount: compensationAmountStr
              }).where(eq2(routeStops.id, targetStop.id));
            }
          }
        }
        if (previousStatus === "OFFERED") {
          const dispatches = await db.select().from(routeOfferDispatches).where(eq2(routeOfferDispatches.route_id, id));
          for (const disp of dispatches) {
            if (disp.status === "SENT") {
              await telegramBot.sendRouteCancellation(disp.telegram_chat_id, id).catch((e) => {
                console.error(`[RouteService] Cancellation notify failed for chat ${disp.telegram_chat_id}:`, e.message);
              });
            }
          }
        }
        if (route.accepted_driver_id && ["ACCEPTED", "ARRIVED_PICKUP", "PICKED_UP", "IN_TRANSIT"].includes(previousStatus)) {
          try {
            const [driver] = await db.select().from(drivers).where(eq2(drivers.id, route.accepted_driver_id));
            if (driver && driver.telegram_chat_id) {
              const cancelMsg = `\u26A0\uFE0F *AVISO OPERACIONAL: CORRIDA #${id} CANCELADA*

A corrida #${id} (${route.pickup_name}) foi cancelada pelo suporte/administra\xE7\xE3o.
Caso j\xE1 esteja no local ou tenha coletado produtos, entre em contato imediatamente com a central ou aguarde instru\xE7\xF5es de devolu\xE7\xE3o.`;
              await telegramBot.sendMessage(driver.telegram_chat_id, cancelMsg).catch((e) => {
                console.error(`[RouteService] Error sending cancellation notice to driver ${driver.id}:`, e.message);
              });
            }
          } catch (e) {
            console.error("[RouteService] Driver cancellation notification error:", e.message);
          }
        }
        const updatedRoute = await this.getRouteById(id);
        return updatedRoute;
      }
      /**
       * M3 & M2.1: Exclusive and Atomic Route Acceptance
       * Guarantees at most ONE winning driver per route even under extreme concurrency.
       * Atomic decision enforced directly in PostgreSQL without in-memory locks.
       * Re-evaluates vehicle compatibility at acceptance moment (Seção 21 & 22).
       */
      async acceptRoute(routeId, identifier) {
        let driver = null;
        if (identifier.telegramUserId) {
          driver = await driverService.getDriverByTelegramUserId(identifier.telegramUserId);
        } else if (identifier.driverId) {
          driver = await driverService.getDriverById(identifier.driverId);
        }
        if (!driver) {
          return {
            status: "REJECTED",
            error: "DRIVER_NOT_FOUND",
            message: "Motorista n\xE3o encontrado."
          };
        }
        if (driver.status === "PENDING") {
          return {
            status: "REJECTED",
            error: "DRIVER_PENDING",
            message: "Seu cadastro est\xE1 aguardando aprova\xE7\xE3o."
          };
        }
        if (driver.status === "BLOCKED") {
          return {
            status: "REJECTED",
            error: "DRIVER_BLOCKED",
            message: "Seu cadastro n\xE3o est\xE1 ativo no momento."
          };
        }
        if (driver.status !== "ACTIVE") {
          return {
            status: "REJECTED",
            error: "DRIVER_NOT_ACTIVE",
            message: "Motorista n\xE3o est\xE1 ativo."
          };
        }
        const route = await this.getRouteById(routeId);
        if (!route) {
          return {
            status: "REJECTED",
            error: "ROUTE_NOT_FOUND",
            message: "Rota n\xE3o encontrada."
          };
        }
        const isVehicleCompatible = canReceiveRouteOffer(driver, route);
        if (!isVehicleCompatible) {
          return {
            status: "REJECTED",
            error: "VEHICLE_INCOMPATIBLE",
            message: "Seu ve\xEDculo atual n\xE3o \xE9 compat\xEDvel com esta rota."
          };
        }
        if (identifier.expectedVersion !== void 0 && identifier.expectedVersion !== route.route_version) {
          return {
            status: "REJECTED",
            error: "STALE_ROUTE_VERSION",
            message: "\u26A0\uFE0F Esta oferta foi atualizada e n\xE3o est\xE1 mais dispon\xEDvel. Verifique a oferta mais recente da rota."
          };
        }
        if (route.status === "CANCELLED") {
          return {
            status: "REJECTED",
            error: "ROUTE_CANCELLED",
            message: "Esta rota foi cancelada."
          };
        }
        const dispatches = await db.select().from(routeOfferDispatches).where(
          and2(
            eq2(routeOfferDispatches.route_id, routeId),
            eq2(routeOfferDispatches.driver_id, driver.id)
          )
        );
        const sentDispatch = dispatches.find((d) => d.status === "SENT" && d.route_version === route.route_version) || dispatches.find((d) => d.status === "SENT");
        if (!sentDispatch) {
          return {
            status: "REJECTED",
            error: "NO_SENT_DISPATCH",
            message: "Voc\xEA n\xE3o recebeu a oferta para esta rota."
          };
        }
        if (route.status === "ACCEPTED" && route.accepted_driver_id === driver.id) {
          return {
            status: "ALREADY_WON",
            route,
            message: "Esta rota j\xE1 est\xE1 confirmada para voc\xEA."
          };
        }
        if (route.status === "ACCEPTED" && route.accepted_driver_id !== driver.id) {
          return {
            status: "LOST",
            message: "Esta rota j\xE1 foi aceita por outro motorista."
          };
        }
        if (route.status !== "OFFERED") {
          return {
            status: "REJECTED",
            error: "ROUTE_NOT_OFFERED",
            message: "Esta rota n\xE3o est\xE1 dispon\xEDvel para aceite."
          };
        }
        const now = /* @__PURE__ */ new Date();
        const calculatedDeadline = computeAcceptedFinalDeadline(route.final_deadline, now);
        const updateResults = await db.update(routes).set({
          status: "ACCEPTED",
          accepted_driver_id: driver.id,
          accepted_at: now,
          final_deadline: calculatedDeadline
        }).where(
          and2(
            eq2(routes.id, routeId),
            eq2(routes.status, "OFFERED"),
            identifier.expectedVersion !== void 0 ? eq2(routes.route_version, identifier.expectedVersion) : sql3`true`
          )
        ).returning();
        if (updateResults.length > 0) {
          const wonRoute = await this.getRouteById(routeId);
          await db.insert(routeEvents).values({
            route_id: routeId,
            event_type: "ROUTE_ACCEPTED",
            actor: `DRIVER #${driver.id}`,
            details: `Accepted by ${driver.name} (Vehicle: ${driver.vehicle_type})`
          });
          await this.invalidateOtherOffers(routeId, driver.id).catch((err) => {
            console.warn("[RouteService] Invalidate other offers error:", err.message);
          });
          return {
            status: "WON",
            route: wonRoute || void 0,
            message: "Rota aceita com sucesso."
          };
        }
        const freshRoute = await this.getRouteById(routeId);
        if (freshRoute?.status === "ACCEPTED" && freshRoute.accepted_driver_id === driver.id) {
          return {
            status: "ALREADY_WON",
            route: freshRoute,
            message: "Esta rota j\xE1 est\xE1 confirmada para voc\xEA."
          };
        }
        if (freshRoute?.status === "ACCEPTED") {
          return {
            status: "LOST",
            message: "Esta rota j\xE1 foi aceita por outro motorista."
          };
        }
        return {
          status: "REJECTED",
          error: "ROUTE_UNAVAILABLE",
          message: "Esta rota n\xE3o est\xE1 mais dispon\xEDvel."
        };
      }
      /**
       * TG-ACCEPT: Invalidate offer messages on other drivers' chats after route is won.
       * Modifies original message to indicate closed state and removes inline keyboard completely.
       * If edit fails or message ID is missing, executes controlled fallback (short message).
       * Safe observability logging: route_id, dispatch_id, driver_id, telegram_message_id, result.
       */
      async invalidateOtherOffers(routeId, winningDriverId) {
        const results = [];
        try {
          const route = await this.getRouteById(routeId);
          if (!route) {
            console.warn(`[RouteService.invalidateOtherOffers] Route #${routeId} not found.`);
            return results;
          }
          const otherDispatches = await db.select().from(routeOfferDispatches).where(
            and2(
              eq2(routeOfferDispatches.route_id, routeId),
              eq2(routeOfferDispatches.route_version, route.route_version),
              eq2(routeOfferDispatches.status, "SENT")
            )
          );
          const targetDispatches = otherDispatches.filter((disp) => disp.driver_id !== winningDriverId);
          await Promise.allSettled(
            targetDispatches.map(async (disp) => {
              try {
                const invResult = await telegramBot.invalidateRouteOffer(
                  disp.telegram_chat_id,
                  disp.telegram_message_id,
                  route
                );
                const outcome = invResult.mode;
                const resItem = {
                  dispatchId: disp.id,
                  driverId: disp.driver_id,
                  telegramChatId: disp.telegram_chat_id,
                  telegramMessageId: disp.telegram_message_id,
                  outcome,
                  error: invResult.error
                };
                results.push(resItem);
                console.info(
                  `[RouteService.invalidateOffer] route_id=${routeId} dispatch_id=${disp.id} driver_id=${disp.driver_id} telegram_message_id=${disp.telegram_message_id} result=${outcome}` + (invResult.error ? ` error=${invResult.error}` : "")
                );
              } catch (err) {
                const errorMsg = err.message || "UNKNOWN_ERROR";
                results.push({
                  dispatchId: disp.id,
                  driverId: disp.driver_id,
                  telegramChatId: disp.telegram_chat_id,
                  telegramMessageId: disp.telegram_message_id,
                  outcome: "FAILED",
                  error: errorMsg
                });
                console.error(
                  `[RouteService.invalidateOffer] route_id=${routeId} dispatch_id=${disp.id} driver_id=${disp.driver_id} telegram_message_id=${disp.telegram_message_id} result=FAILED error=${errorMsg}`
                );
              }
            })
          );
        } catch (err) {
          console.error("[RouteService.invalidateOtherOffers] Fatal error:", err.message);
        }
        return results;
      }
      // ==========================================
      // M4: EXECUÇÃO OPERACIONAL DA ROTA & PARADAS
      // ==========================================
      /**
       * Resolve and validate driver from driverId or telegramUserId
       */
      async resolveDriver(identifier) {
        if (identifier.driverId) {
          const drv = await driverService.getDriverById(identifier.driverId);
          if (!drv) throw new Error("DRIVER_NOT_FOUND");
          return drv;
        }
        if (identifier.telegramUserId) {
          const drv = await driverService.getDriverByTelegramUserId(identifier.telegramUserId);
          if (!drv) throw new Error("DRIVER_NOT_REGISTERED");
          return drv;
        }
        throw new Error("MISSING_DRIVER_IDENTIFIER");
      }
      /**
       * Get single stop by ID
       */
      async getStopById(stopId) {
        const rows = await db.select().from(routeStops).where(eq2(routeStops.id, stopId));
        if (rows.length === 0) return null;
        return this.parseRouteStopRow(rows[0]);
      }
      /**
       * Get next pending stop for a route, ordered by sequence
       */
      async getNextPendingStop(routeId) {
        const rows = await db.select().from(routeStops).where(and2(eq2(routeStops.route_id, routeId), eq2(routeStops.status, "PENDING"))).orderBy(asc2(routeStops.sequence));
        if (rows.length === 0) return null;
        return this.parseRouteStopRow(rows[0]);
      }
      /**
       * M4 Seção 8: CHEGUEI PARA COLETA
       * Transition: ACCEPTED -> ARRIVED_PICKUP
       */
      async markArrivedPickup(routeId, identifier) {
        const driver = await this.resolveDriver(identifier);
        const route = await this.getRouteById(routeId);
        if (!route) throw new Error("ROUTE_NOT_FOUND");
        if (route.accepted_driver_id !== driver.id) {
          throw new Error("UNAUTHORIZED_DRIVER: Motorista n\xE3o \xE9 o vencedor desta rota");
        }
        if (route.status === "ARRIVED_PICKUP") {
          return route;
        }
        if (route.status !== "ACCEPTED") {
          throw new Error(`INVALID_STATUS_TRANSITION: Status atual '${route.status}', esperado 'ACCEPTED'`);
        }
        const now = /* @__PURE__ */ new Date();
        await db.update(routes).set({
          status: "ARRIVED_PICKUP",
          arrived_pickup_at: now
        }).where(eq2(routes.id, routeId));
        await db.insert(routeEvents).values({
          route_id: routeId,
          event_type: "ROUTE_ARRIVED_PICKUP",
          actor: `DRIVER #${driver.id}`,
          details: `Driver ${driver.name} arrived at pickup point ${route.pickup_name}`
        });
        const updated = await this.getRouteById(routeId);
        return updated;
      }
      /**
       * M4 Seção 9: PEDIDOS COLETADOS
       * Transition: ARRIVED_PICKUP -> PICKED_UP
       */
      async markPickedUp(routeId, identifier) {
        const driver = await this.resolveDriver(identifier);
        const route = await this.getRouteById(routeId);
        if (!route) throw new Error("ROUTE_NOT_FOUND");
        if (route.accepted_driver_id !== driver.id) {
          throw new Error("UNAUTHORIZED_DRIVER: Motorista n\xE3o \xE9 o vencedor desta rota");
        }
        if (route.status === "PICKED_UP") {
          return route;
        }
        if (route.status !== "ARRIVED_PICKUP") {
          throw new Error(`INVALID_STATUS_TRANSITION: Status atual '${route.status}', esperado 'ARRIVED_PICKUP'`);
        }
        const now = /* @__PURE__ */ new Date();
        await db.update(routes).set({
          status: "PICKED_UP",
          picked_up_at: now
        }).where(eq2(routes.id, routeId));
        await db.insert(routeEvents).values({
          route_id: routeId,
          event_type: "ROUTE_PICKED_UP",
          actor: `DRIVER #${driver.id}`,
          details: `Orders collected by driver ${driver.name} (${route.stops?.length || 0} stops loaded)`
        });
        const updated = await this.getRouteById(routeId);
        return updated;
      }
      /**
       * M4 Seção 10: INICIAR ROTA
       * Transition: PICKED_UP -> IN_TRANSIT
       */
      async startRoute(routeId, identifier) {
        const driver = await this.resolveDriver(identifier);
        const route = await this.getRouteById(routeId);
        if (!route) throw new Error("ROUTE_NOT_FOUND");
        if (route.accepted_driver_id !== driver.id) {
          throw new Error("UNAUTHORIZED_DRIVER: Motorista n\xE3o \xE9 o vencedor desta rota");
        }
        if (route.status === "IN_TRANSIT") {
          const nextStop2 = await this.getNextPendingStop(routeId);
          return { route, nextStop: nextStop2 };
        }
        if (route.status !== "PICKED_UP") {
          throw new Error(`INVALID_STATUS_TRANSITION: Status atual '${route.status}', esperado 'PICKED_UP'`);
        }
        const now = /* @__PURE__ */ new Date();
        await db.update(routes).set({
          status: "IN_TRANSIT",
          started_at: now
        }).where(eq2(routes.id, routeId));
        await db.insert(routeEvents).values({
          route_id: routeId,
          event_type: "ROUTE_STARTED",
          actor: `DRIVER #${driver.id}`,
          details: `Route started by driver ${driver.name}`
        });
        const updated = await this.getRouteById(routeId);
        const nextStop = await this.getNextPendingStop(routeId);
        return { route: updated, nextStop };
      }
      /**
       * Check if all stops in route are terminal (DELIVERED or INCIDENT) and auto-complete route
       * (M4 Seção 23 & 24)
       * REGRA: Se houver qualquer incidente reportado nesta corrida, a rota NÃO deve ser finalizada
       * automaticamente nem prometer pagamento imediato. Devemos tratar e resolver primeiro antes de finalizar e pagar.
       */
      async checkAndCompleteRouteIfTerminal(routeId) {
        const allStops = await db.select().from(routeStops).where(eq2(routeStops.route_id, routeId));
        const pendingStops = allStops.filter((s) => s.status === "PENDING");
        const remainingCount = pendingStops.length;
        const hasIncident = allStops.some((s) => s.status === "INCIDENT");
        const hasUnresolvedIncident = allStops.some(
          (s) => s.status === "INCIDENT" && (s.incident_resolution_status || "OPEN") !== "RESOLVED"
        );
        if (remainingCount === 0 && allStops.length > 0) {
          if (hasIncident || hasUnresolvedIncident) {
            return {
              routeCompleted: false,
              remainingCount: 0,
              hasIncident: true,
              hasUnresolvedIncident
            };
          }
          const now = /* @__PURE__ */ new Date();
          await db.update(routes).set({
            status: "COMPLETED",
            completed_at: now
          }).where(eq2(routes.id, routeId));
          await db.insert(routeEvents).values({
            route_id: routeId,
            event_type: "ROUTE_COMPLETED",
            actor: "SYSTEM",
            details: `Route completed automatically. All ${allStops.length} stops delivered successfully.`
          });
          return {
            routeCompleted: true,
            remainingCount: 0,
            hasIncident: false,
            hasUnresolvedIncident: false,
            completedAt: now
          };
        }
        return {
          routeCompleted: false,
          remainingCount,
          hasIncident,
          hasUnresolvedIncident
        };
      }
      /**
       * Finalizar manualmente rota pelo atendente/admin após tratamento de incidentes e liberar para pagamento PIX
       */
      async finalizeAndCompleteRoute(routeId, actor = "ADMIN") {
        const route = await this.getRouteById(routeId);
        if (!route) throw new Error("ROUTE_NOT_FOUND");
        const now = /* @__PURE__ */ new Date();
        await db.update(routes).set({
          status: "COMPLETED",
          completed_at: route.completed_at || now
        }).where(eq2(routes.id, routeId));
        await db.insert(routeEvents).values({
          route_id: routeId,
          event_type: "ROUTE_COMPLETED",
          actor,
          details: `Route finalized manually by ${actor} after treating incidents/pendencies.`
        });
        const updated = await this.getRouteById(routeId);
        return updated;
      }
      /**
       * M4 Seção 13, 14, 15, 16: ENTREGA PRESENCIAL — PIN
       * Validate STOP PIN and conclude STOP
       */
      async deliverStopWithPin(stopId, pin, identifier) {
        const driver = await this.resolveDriver(identifier);
        const stop = await this.getStopById(stopId);
        if (!stop) throw new Error("STOP_NOT_FOUND");
        const route = await this.getRouteById(stop.route_id);
        if (!route) throw new Error("ROUTE_NOT_FOUND");
        if (route.accepted_driver_id !== driver.id) {
          throw new Error("UNAUTHORIZED_DRIVER: Motorista n\xE3o \xE9 o vencedor desta rota");
        }
        if (route.status !== "IN_TRANSIT") {
          throw new Error(`INVALID_STATUS_TRANSITION: Rota n\xE3o est\xE1 em tr\xE2nsito (status atual: ${route.status})`);
        }
        if (stop.status === "DELIVERED") {
          const remainingCount = (route.stops || []).filter((s) => s.status === "PENDING").length;
          return {
            success: true,
            stop,
            routeCompleted: route.status === "COMPLETED",
            remainingCount,
            message: "Esta entrega j\xE1 foi confirmada anteriormente."
          };
        }
        if (stop.status !== "PENDING") {
          throw new Error(`CANNOT_DELIVER_STOP_IN_STATUS_${stop.status}`);
        }
        if (stop.delivery_mode !== "IN_PERSON") {
          throw new Error("INVALID_DELIVERY_MODE: Esta parada requer comprovante por foto");
        }
        const normalizedInputPin = (pin || "").trim();
        if (!stop.pin_code || normalizedInputPin !== stop.pin_code.trim()) {
          return {
            success: false,
            error: "INVALID_PIN",
            message: `\u274C Corrida #${route.id}: PIN incorreto.
Confira com o cliente e tente novamente.`
          };
        }
        const now = /* @__PURE__ */ new Date();
        await db.update(routeStops).set({
          status: "DELIVERED",
          delivered_at: now,
          completed_at: now,
          proof_type: "PIN"
        }).where(eq2(routeStops.id, stopId));
        await db.insert(routeEvents).values({
          route_id: route.id,
          event_type: "STOP_DELIVERED",
          actor: `DRIVER #${driver.id}`,
          details: `Stop #${stop.sequence} delivered (PIN validated)`
        });
        const updatedStop = await this.getStopById(stopId);
        const completion = await this.checkAndCompleteRouteIfTerminal(route.id);
        const nextStop = completion.routeCompleted ? null : await this.getNextPendingStop(route.id);
        return {
          success: true,
          stop: updatedStop,
          routeCompleted: completion.routeCompleted,
          remainingCount: completion.remainingCount,
          hasIncident: completion.hasIncident,
          hasUnresolvedIncident: completion.hasUnresolvedIncident,
          nextStop,
          message: `Corrida #${route.id}: Entrega confirmada com sucesso via PIN.`
        };
      }
      /**
       * M4 Seção 17, 18: ENTREGA SEM CONTATO — FOTO
       * Validate photo evidence and conclude STOP
       */
      async deliverStopWithPhoto(stopId, proofReference, identifier) {
        const driver = await this.resolveDriver(identifier);
        const stop = await this.getStopById(stopId);
        if (!stop) throw new Error("STOP_NOT_FOUND");
        const route = await this.getRouteById(stop.route_id);
        if (!route) throw new Error("ROUTE_NOT_FOUND");
        if (route.accepted_driver_id !== driver.id) {
          throw new Error("UNAUTHORIZED_DRIVER: Motorista n\xE3o \xE9 o vencedor desta rota");
        }
        if (route.status !== "IN_TRANSIT") {
          throw new Error(`INVALID_STATUS_TRANSITION: Rota n\xE3o est\xE1 em tr\xE2nsito (status atual: ${route.status})`);
        }
        if (stop.status === "DELIVERED") {
          const remainingCount = (route.stops || []).filter((s) => s.status === "PENDING").length;
          return {
            success: true,
            stop,
            routeCompleted: route.status === "COMPLETED",
            remainingCount,
            message: `Corrida #${route.id}: Esta entrega j\xE1 foi confirmada anteriormente.`
          };
        }
        if (stop.status !== "PENDING") {
          throw new Error(`CANNOT_DELIVER_STOP_IN_STATUS_${stop.status}`);
        }
        if (stop.delivery_mode !== "NO_CONTACT") {
          throw new Error("INVALID_DELIVERY_MODE: Esta parada requer confirma\xE7\xE3o por PIN presencial");
        }
        const ref = (proofReference || "").trim();
        if (!ref) {
          throw new Error("MISSING_PHOTO_PROOF: Nenhuma foto de comprovante informada");
        }
        const existingUsage = await db.select().from(routeStops).where(and2(eq2(routeStops.proof_reference, ref), eq2(routeStops.status, "DELIVERED")));
        if (existingUsage.length > 0 && existingUsage[0].id !== stopId) {
          throw new Error("PHOTO_ALREADY_USED: Esta foto j\xE1 foi utilizada para comprovar outra parada");
        }
        const now = /* @__PURE__ */ new Date();
        await db.update(routeStops).set({
          status: "DELIVERED",
          delivered_at: now,
          completed_at: now,
          proof_type: "PHOTO",
          proof_reference: ref
        }).where(eq2(routeStops.id, stopId));
        await db.insert(routeEvents).values({
          route_id: route.id,
          event_type: "STOP_DELIVERED",
          actor: `DRIVER #${driver.id}`,
          details: `Stop #${stop.sequence} delivered (Photo proof attached)`
        });
        const updatedStop = await this.getStopById(stopId);
        const completion = await this.checkAndCompleteRouteIfTerminal(route.id);
        const nextStop = completion.routeCompleted ? null : await this.getNextPendingStop(route.id);
        return {
          success: true,
          stop: updatedStop,
          routeCompleted: completion.routeCompleted,
          remainingCount: completion.remainingCount,
          hasIncident: completion.hasIncident,
          hasUnresolvedIncident: completion.hasUnresolvedIncident,
          nextStop,
          message: `Corrida #${route.id}: Entrega confirmada com sucesso via foto.`
        };
      }
      /**
       * M4 Seção 20, 21: REGISTRO DE INCIDENTE NA PARADA
       * Transition: PENDING -> INCIDENT
       */
      async reportStopIncident(stopId, data, identifier) {
        const driver = await this.resolveDriver(identifier);
        const stop = await this.getStopById(stopId);
        if (!stop) throw new Error("STOP_NOT_FOUND");
        const route = await this.getRouteById(stop.route_id);
        if (!route) throw new Error("ROUTE_NOT_FOUND");
        if (route.accepted_driver_id !== driver.id) {
          throw new Error("UNAUTHORIZED_DRIVER: Motorista n\xE3o \xE9 o vencedor desta rota");
        }
        if (route.status !== "IN_TRANSIT") {
          throw new Error(`INVALID_STATUS_TRANSITION: Rota n\xE3o est\xE1 em tr\xE2nsito (status atual: ${route.status})`);
        }
        if (stop.status === "DELIVERED") {
          throw new Error("CANNOT_REPORT_INCIDENT_ON_DELIVERED_STOP");
        }
        if (stop.status === "INCIDENT") {
          const remainingCount = (route.stops || []).filter((s) => s.status === "PENDING").length;
          return {
            success: true,
            stop,
            routeCompleted: route.status === "COMPLETED",
            remainingCount,
            message: "Incidente j\xE1 registrado para esta parada."
          };
        }
        if (stop.status !== "PENDING") {
          throw new Error(`CANNOT_REPORT_INCIDENT_IN_STATUS_${stop.status}`);
        }
        const now = /* @__PURE__ */ new Date();
        await db.update(routeStops).set({
          status: "INCIDENT",
          incident_type: data.incident_type,
          incident_note: data.incident_note?.trim() || null,
          incident_at: now,
          completed_at: now,
          incident_resolution_status: "OPEN"
          // M4.1 Parte B: automaticamente OPEN ao virar INCIDENT
        }).where(eq2(routeStops.id, stopId));
        await db.insert(routeEvents).values({
          route_id: route.id,
          event_type: "STOP_INCIDENT",
          actor: `DRIVER #${driver.id}`,
          details: `Stop #${stop.sequence} incident: ${data.incident_type}${data.incident_note ? " - " + data.incident_note : ""}`
        });
        const updatedStop = await this.getStopById(stopId);
        const completion = await this.checkAndCompleteRouteIfTerminal(route.id);
        const nextStop = completion.routeCompleted ? null : await this.getNextPendingStop(route.id);
        return {
          success: true,
          stop: updatedStop,
          routeCompleted: completion.routeCompleted,
          remainingCount: completion.remainingCount,
          hasIncident: true,
          hasUnresolvedIncident: true,
          nextStop,
          message: "Incidente registrado com sucesso."
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
      async resolveStopIncident(stopId, data) {
        const validResolutionTypes = [
          "RETURN_TO_ORIGIN",
          "DELIVERED_LATER",
          "DELIVERED_TO_ALTERNATIVE_LOCATION",
          "CUSTOMER_PICKUP",
          "DISCARDED",
          "CANCELLATION",
          "OTHER"
        ];
        if (!validResolutionTypes.includes(data.resolution_type)) {
          throw new Error(`INVALID_RESOLUTION_TYPE: ${data.resolution_type}`);
        }
        const stop = await this.getStopById(stopId);
        if (!stop) throw new Error("STOP_NOT_FOUND");
        if (stop.status !== "INCIDENT") {
          throw new Error(`STOP_IS_NOT_AN_INCIDENT: Status atual '${stop.status}', esperado 'INCIDENT'`);
        }
        const now = /* @__PURE__ */ new Date();
        await db.update(routeStops).set({
          incident_resolution_status: "RESOLVED",
          resolution_type: data.resolution_type,
          resolution_note: data.resolution_note?.trim() || null,
          resolved_at: now,
          resolved_by: data.resolved_by,
          compensation_amount: data.compensation_amount !== void 0 ? data.compensation_amount.toFixed(2) : null
        }).where(eq2(routeStops.id, stopId));
        if (data.compensation_amount !== void 0 && data.adjust_route_fee !== false) {
          if (data.compensation_amount > 0) {
            await db.update(routes).set({
              total_fee: data.compensation_amount.toFixed(2),
              final_driver_fee: data.compensation_amount.toFixed(2),
              payment_status: "PENDING"
            }).where(eq2(routes.id, stop.route_id));
          } else {
            await db.update(routes).set({
              total_fee: "0.00",
              final_driver_fee: "0.00",
              payment_status: "PAID",
              paid_at: now,
              paid_by: data.resolved_by,
              payment_note: "Isento de repasse - Resolu\xE7\xE3o de pend\xEAncia sem custo financeiro"
            }).where(eq2(routes.id, stop.route_id));
          }
        }
        await db.insert(routeEvents).values({
          route_id: stop.route_id,
          event_type: "STOP_INCIDENT_RESOLVED",
          actor: data.resolved_by,
          details: `Stop #${stop.sequence} incident resolved as ${data.resolution_type}${data.compensation_amount !== void 0 ? ` (Repasse acordado: R$ ${data.compensation_amount.toFixed(2)})` : ""}${data.resolution_note ? " - " + data.resolution_note : ""}`
        });
        const updated = await this.getStopById(stopId);
        return updated;
      }
      /**
       * Listar incidentes operacionais para a seção ⚠️ PENDÊNCIAS
       */
      async getIncidents(filters) {
        const incidentStops = await db.select().from(routeStops).where(eq2(routeStops.status, "INCIDENT")).orderBy(desc2(routeStops.incident_at), desc2(routeStops.id));
        if (incidentStops.length === 0) return [];
        const routeIds = Array.from(new Set(incidentStops.map((s) => s.route_id)));
        const routeRows = await db.select().from(routes).where(sql3`${routes.id} IN (${sql3.join(routeIds.map((id) => sql3`${id}`), sql3`, `)})`);
        const routeMap = /* @__PURE__ */ new Map();
        for (const r of routeRows) {
          routeMap.set(r.id, this.parseRouteRow(r));
        }
        const driverIds = Array.from(
          new Set(
            routeRows.map((r) => r.accepted_driver_id).filter((id) => id !== null && id !== void 0)
          )
        );
        const driverMap = /* @__PURE__ */ new Map();
        if (driverIds.length > 0) {
          const driverRows = await db.select().from(drivers).where(sql3`${drivers.id} IN (${sql3.join(driverIds.map((id) => sql3`${id}`), sql3`, `)})`);
          for (const d of driverRows) {
            driverMap.set(d.id, d);
          }
        }
        let items = incidentStops.map((s) => {
          const route = routeMap.get(s.route_id);
          const driver = route?.accepted_driver_id ? driverMap.get(route.accepted_driver_id) || null : null;
          return {
            stop: s,
            route,
            driver
          };
        }).filter((item) => {
          if (item.route?.status === "CANCELLED" && !item.route?.accepted_driver_id) {
            return false;
          }
          return true;
        });
        if (filters?.resolution_status && filters.resolution_status !== "ALL") {
          items = items.filter((item) => (item.stop.incident_resolution_status || "OPEN") === filters.resolution_status);
        }
        if (filters?.search) {
          const q = filters.search.toLowerCase();
          items = items.filter(
            (item) => item.stop.cargo_description.toLowerCase().includes(q) || item.stop.destination_address.toLowerCase().includes(q) || item.stop.destination_neighborhood.toLowerCase().includes(q) || (item.stop.incident_type || "").toLowerCase().includes(q) || (item.stop.incident_note || "").toLowerCase().includes(q) || (item.driver?.name || "").toLowerCase().includes(q) || String(item.route.id).includes(q)
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
      async registerRoutePayment(routeId, data) {
        const route = await this.getRouteById(routeId);
        if (!route) throw new Error("ROUTE_NOT_FOUND");
        if (route.status !== "COMPLETED" && route.status !== "CANCELLED") {
          throw new Error(
            `CANNOT_PAY_NON_TERMINAL_ROUTE: Apenas rotas conclu\xEDdas ou canceladas podem receber repasse/acerto financeiro (status atual: ${route.status})`
          );
        }
        if (route.payment_status === "PAID") {
          throw new Error("ROUTE_ALREADY_PAID: O pagamento desta rota j\xE1 foi registrado");
        }
        const now = /* @__PURE__ */ new Date();
        await db.update(routes).set({
          payment_status: "PAID",
          paid_at: now,
          paid_by: data.paid_by,
          payment_method: data.payment_method || "PIX",
          payment_reference: data.payment_reference?.trim() || null,
          payment_note: data.payment_note?.trim() || null
        }).where(eq2(routes.id, routeId));
        await db.insert(routeEvents).values({
          route_id: routeId,
          event_type: "ROUTE_PAYMENT_REGISTERED",
          actor: data.paid_by,
          details: `Payment registered: R$ ${route.total_fee} via ${data.payment_method || "PIX"}${data.payment_reference ? " (Ref: " + data.payment_reference + ")" : ""}`
        });
        if (route.accepted_driver_id) {
          try {
            const [driver] = await db.select().from(drivers).where(eq2(drivers.id, route.accepted_driver_id));
            if (driver && driver.telegram_chat_id) {
              const totalNum = parseFloat(String(route.total_fee || "0").replace(",", ".")) || 0;
              const storeRate = route.management_rate_snapshot != null && !isNaN(parseFloat(String(route.management_rate_snapshot))) ? parseFloat(String(route.management_rate_snapshot)) : 0.1;
              const driverFeeNum = Math.round(totalNum * (1 - storeRate) * 100) / 100;
              const driverFeeStr = driverFeeNum.toFixed(2).replace(".", ",");
              const msg = `\u{1F4B0} *Repasse Realizado com Sucesso!*

O pagamento referente \xE0 *Rota #${route.id}* no valor de *R$ ${driverFeeStr}* foi registrado via Pix.

` + (data.payment_reference ? `*Comprovante/Ref:* \`${data.payment_reference}\`
` : "") + (data.payment_note ? `*Observa\xE7\xE3o:* ${data.payment_note}
` : "") + `
Agradecemos pela sua dedica\xE7\xE3o nas entregas! \u{1F680}`;
              await telegramBot.sendMessage(driver.telegram_chat_id, msg);
            }
          } catch (notifyErr) {
            console.warn("[RouteService] Failed to notify driver of payment via Telegram:", notifyErr.message);
          }
        }
        const updated = await this.getRouteById(routeId);
        return updated;
      }
      /**
       * Resumo e listagem de pagamentos de rotas para o painel administrativo
       */
      async getPaymentsData(filters) {
        const payableRows = await db.select().from(routes).where(
          or(
            eq2(routes.status, "COMPLETED"),
            and2(eq2(routes.status, "CANCELLED"), isNotNull(routes.accepted_driver_id))
          )
        ).orderBy(desc2(routes.completed_at), desc2(routes.id));
        const allRoutes = payableRows.map((r) => this.parseRouteRow(r));
        const driverIds = Array.from(
          new Set(
            allRoutes.map((r) => r.accepted_driver_id).filter((id) => id !== null && id !== void 0)
          )
        );
        const driverMap = /* @__PURE__ */ new Map();
        if (driverIds.length > 0) {
          const driverRows = await db.select().from(drivers).where(sql3`${drivers.id} IN (${sql3.join(driverIds.map((id) => sql3`${id}`), sql3`, `)})`);
          for (const d of driverRows) {
            driverMap.set(d.id, d);
          }
        }
        const parseCurrency = (fee) => {
          if (!fee) return 0;
          const cleaned = String(fee).replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", ".");
          const num = parseFloat(cleaned);
          return isNaN(num) ? 0 : num;
        };
        let totalPendingAmount = 0;
        let totalPaidAmount = 0;
        let pendingRoutesCount = 0;
        let paidRoutesCount = 0;
        const perDriverMap = /* @__PURE__ */ new Map();
        for (const r of allRoutes) {
          const totalNum = parseCurrency(r.total_fee);
          const rate = r.management_rate_snapshot != null && !isNaN(parseFloat(String(r.management_rate_snapshot))) ? parseFloat(String(r.management_rate_snapshot)) : 0.1;
          const feeNum = r.status === "CANCELLED" ? totalNum : Math.round(totalNum * (1 - rate) * 100) / 100;
          const isPaid = r.payment_status === "PAID";
          if (isPaid) {
            totalPaidAmount += feeNum;
            paidRoutesCount++;
          } else {
            totalPendingAmount += feeNum;
            pendingRoutesCount++;
          }
          if (r.accepted_driver_id && driverMap.has(r.accepted_driver_id)) {
            const driver = driverMap.get(r.accepted_driver_id);
            if (!perDriverMap.has(driver.id)) {
              perDriverMap.set(driver.id, {
                driver,
                pendingAmount: 0,
                pendingRoutesCount: 0,
                paidAmount: 0,
                paidRoutesCount: 0
              });
            }
            const item = perDriverMap.get(driver.id);
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
          driver: route.accepted_driver_id ? driverMap.get(route.accepted_driver_id) || null : null
        }));
        if (filters?.payment_status && filters.payment_status !== "ALL") {
          filteredRoutes = filteredRoutes.filter((item) => item.route.payment_status === filters.payment_status);
        }
        if (filters?.driver_id) {
          filteredRoutes = filteredRoutes.filter((item) => item.route.accepted_driver_id === filters.driver_id);
        }
        if (filters?.search) {
          const q = filters.search.toLowerCase();
          filteredRoutes = filteredRoutes.filter(
            (item) => String(item.route.id).includes(q) || item.route.pickup_name.toLowerCase().includes(q) || (item.driver?.name || "").toLowerCase().includes(q) || (item.driver?.phone || "").includes(q) || (item.driver?.pix_key_value || "").toLowerCase().includes(q) || (item.route.payment_reference || "").toLowerCase().includes(q)
          );
        }
        return {
          summary: {
            totalPendingAmount,
            totalPaidAmount,
            pendingRoutesCount,
            paidRoutesCount,
            totalCompletedRoutesCount: allRoutes.length
          },
          driversSummary: Array.from(perDriverMap.values()).sort(
            (a, b) => b.pendingAmount - a.pendingAmount
          ),
          routes: filteredRoutes
        };
      }
      /**
       * M4.3: Retorna links de navegação para a rota, com validação estrita de autorização
       * - Antes do aceite (DRAFT/OFFERED): Acesso negado para proteger privacidade dos clientes
       * - Após o aceite: Apenas o motorista vencedor pode acessar os links
       */
      async getRouteNavigation(routeId, identifier) {
        const route = await this.getRouteById(routeId);
        if (!route) {
          throw new Error("ROUTE_NOT_FOUND");
        }
        let driver = null;
        if (identifier.telegramUserId) {
          driver = await driverService.getDriverByTelegramUserId(identifier.telegramUserId);
        } else if (identifier.driverId) {
          driver = await driverService.getDriverById(identifier.driverId);
        }
        if (!driver) {
          throw new Error("DRIVER_NOT_FOUND");
        }
        if (route.status === "DRAFT" || route.status === "OFFERED") {
          throw new Error("FORBIDDEN_PRE_ACCEPTANCE");
        }
        if (route.accepted_driver_id !== driver.id) {
          throw new Error("FORBIDDEN_NOT_WINNING_DRIVER");
        }
        return generateRouteNavigationLinks(route);
      }
    };
    routeService = new RouteService();
    try {
      telegramBot?.setRouteService(routeService);
    } catch {
    }
  }
});

// src/server/routeEditService.ts
import { eq as eq3, and as and3, sql as sql4 } from "drizzle-orm";
var RouteEditService, routeEditService;
var init_routeEditService = __esm({
  "src/server/routeEditService.ts"() {
    init_db();
    init_schema();
    init_routeService();
    init_telegramBot();
    init_driverService();
    RouteEditService = class {
      /**
       * Classifica a alteração proposta entre OPERACIONAL e MATERIAL,
       * gerando diff estruturado e resumo legível para confirmação administrativa.
       */
      classifyRouteEdit(existingRoute, editData) {
        const status = existingRoute.status;
        const diff_items = [];
        const changed_fields = [];
        let is_material = false;
        if (editData.pickup_address && editData.pickup_address.trim() !== existingRoute.pickup_address.trim()) {
          is_material = true;
          changed_fields.push("pickup_address");
          diff_items.push({
            field: "pickup_address",
            label: "Endere\xE7o de Coleta",
            old_value: existingRoute.pickup_address,
            new_value: editData.pickup_address.trim()
          });
        }
        if (editData.pickup_location_id !== void 0 && editData.pickup_location_id !== existingRoute.pickup_location_id) {
          is_material = true;
          changed_fields.push("pickup_location_id");
          diff_items.push({
            field: "pickup_location_id",
            label: "Ponto de Coleta Cadastrado",
            old_value: existingRoute.pickup_location_id,
            new_value: editData.pickup_location_id
          });
        }
        if (editData.final_driver_fee !== void 0 && editData.final_driver_fee !== null) {
          const parsedNewFee = parseFloat(String(editData.final_driver_fee).replace(",", "."));
          const oldFee = existingRoute.final_driver_fee ?? parseFloat(existingRoute.total_fee.replace(",", "."));
          if (!isNaN(parsedNewFee) && Math.abs(parsedNewFee - oldFee) > 9e-3) {
            is_material = true;
            changed_fields.push("final_driver_fee");
            diff_items.push({
              field: "final_driver_fee",
              label: "Frete Pago ao Motorista",
              old_value: `R$ ${oldFee.toFixed(2).replace(".", ",")}`,
              new_value: `R$ ${parsedNewFee.toFixed(2).replace(".", ",")}`
            });
          }
        }
        if (editData.final_deadline && editData.final_deadline.trim() !== existingRoute.final_deadline.trim()) {
          changed_fields.push("final_deadline");
          diff_items.push({
            field: "final_deadline",
            label: "Prazo Final da Rota",
            old_value: existingRoute.final_deadline,
            new_value: editData.final_deadline.trim()
          });
        }
        if (editData.accepted_vehicle_types && Array.isArray(editData.accepted_vehicle_types)) {
          const oldVehicles = [...existingRoute.accepted_vehicle_types || []].sort().join(",");
          const newVehicles = [...editData.accepted_vehicle_types].sort().join(",");
          if (oldVehicles !== newVehicles) {
            changed_fields.push("accepted_vehicle_types");
            const formatVehicles = (list) => list.map((v) => v === "CAR" ? "\u{1F697} Carro" : v === "MOTO" ? "\u{1F3CD}\uFE0F Moto" : v === "MOTO_WITH_BAG" ? "\u{1F392} Moto c/ Bag" : v).join(", ");
            diff_items.push({
              field: "accepted_vehicle_types",
              label: "Ve\xEDculos Aceit\xE1veis",
              old_value: formatVehicles(existingRoute.accepted_vehicle_types || []),
              new_value: formatVehicles(editData.accepted_vehicle_types)
            });
          }
        }
        if (editData.stops) {
          const existingStops = existingRoute.stops || [];
          for (const oldStop of existingStops) {
            if (oldStop.status === "DELIVERED") {
              const edited = editData.stops.find((s) => s.id === oldStop.id);
              if (edited) {
                if (edited.destination_address.trim() !== oldStop.destination_address.trim() || edited.destination_neighborhood.trim() !== oldStop.destination_neighborhood.trim() || edited.cargo_description.trim() !== oldStop.cargo_description.trim()) {
                  throw new Error(
                    "CANNOT_EDIT_COMPLETED_STOP: N\xE3o \xE9 permitido alterar dados de paradas j\xE1 conclu\xEDdas."
                  );
                }
              }
            }
          }
          if (editData.stops.length > existingStops.length) {
            is_material = true;
            changed_fields.push("stops_added");
            const addedCount = editData.stops.length - existingStops.length;
            diff_items.push({
              field: "stops_added",
              label: "Paradas Adicionadas",
              old_value: `${existingStops.length} entregas`,
              new_value: `${editData.stops.length} entregas (+${addedCount})`
            });
          }
          if (editData.stops.length < existingStops.length) {
            is_material = true;
            changed_fields.push("stops_removed");
            const removedCount = existingStops.length - editData.stops.length;
            diff_items.push({
              field: "stops_removed",
              label: "Paradas Removidas",
              old_value: `${existingStops.length} entregas`,
              new_value: `${editData.stops.length} entregas (-${removedCount})`
            });
          }
          for (let i = 0; i < editData.stops.length; i++) {
            const newStop = editData.stops[i];
            const oldStop = newStop.id ? existingStops.find((s) => s.id === newStop.id) : existingStops[i];
            if (oldStop) {
              if (newStop.destination_address && newStop.destination_address.trim() !== oldStop.destination_address.trim()) {
                changed_fields.push(`stop_${oldStop.sequence}_address`);
                diff_items.push({
                  field: `stop_${oldStop.sequence}_address`,
                  label: `Endere\xE7o Entrega #${oldStop.sequence}`,
                  old_value: oldStop.destination_address,
                  new_value: newStop.destination_address.trim()
                });
              }
              if (newStop.destination_neighborhood && newStop.destination_neighborhood.trim() !== oldStop.destination_neighborhood.trim()) {
                changed_fields.push(`stop_${oldStop.sequence}_neighborhood`);
                diff_items.push({
                  field: `stop_${oldStop.sequence}_neighborhood`,
                  label: `Bairro Entrega #${oldStop.sequence}`,
                  old_value: oldStop.destination_neighborhood,
                  new_value: newStop.destination_neighborhood.trim()
                });
              }
              if (newStop.desired_deadline !== void 0 && newStop.desired_deadline !== oldStop.desired_deadline) {
                changed_fields.push(`stop_${oldStop.sequence}_deadline`);
                diff_items.push({
                  field: `stop_${oldStop.sequence}_deadline`,
                  label: `Prazo Desej\xE1vel #${oldStop.sequence}`,
                  old_value: oldStop.desired_deadline || "N\xE3o informado",
                  new_value: newStop.desired_deadline || "N\xE3o informado"
                });
              }
              if (newStop.observations !== void 0 && newStop.observations !== oldStop.observations) {
                changed_fields.push(`stop_${oldStop.sequence}_observations`);
                diff_items.push({
                  field: `stop_${oldStop.sequence}_observations`,
                  label: `Observa\xE7\xF5es #${oldStop.sequence}`,
                  old_value: oldStop.observations || "Nenhuma",
                  new_value: newStop.observations || "Nenhuma"
                });
              }
              if (newStop.cargo_description && newStop.cargo_description.trim() !== oldStop.cargo_description.trim()) {
                changed_fields.push(`stop_${oldStop.sequence}_cargo`);
                diff_items.push({
                  field: `stop_${oldStop.sequence}_cargo`,
                  label: `Pedido/Carga #${oldStop.sequence}`,
                  old_value: oldStop.cargo_description,
                  new_value: newStop.cargo_description.trim()
                });
              }
            }
          }
        }
        let change_type = is_material ? "MATERIAL" : "OPERATIONAL";
        if (status === "DRAFT") {
          change_type = "DRAFT_EDIT";
          is_material = false;
        } else if (status === "OFFERED") {
          change_type = "OFFERED_REOFFER";
          is_material = false;
        }
        const summaryLines = diff_items.map((item) => {
          return `\u2022 ${item.label}:
  ANTES: ${item.old_value}
  DEPOIS: ${item.new_value}`;
        });
        const diff_summary = summaryLines.length > 0 ? summaryLines.join("\n\n") : "Nenhuma altera\xE7\xE3o detectada";
        return {
          change_type,
          is_material,
          changed_fields,
          diff_summary,
          diff_items
        };
      }
      /**
       * Executa a edição controlada com proteção de concorrência e aplicação conforme classificação.
       */
      async executeRouteEdit(routeId, editData, actor = "ADMIN") {
        const existingRoute = await routeService.getRouteById(routeId);
        if (!existingRoute) {
          throw new Error("ROUTE_NOT_FOUND");
        }
        if (existingRoute.status === "COMPLETED") {
          throw new Error("CANNOT_EDIT_COMPLETED_ROUTE: Rotas conclu\xEDdas n\xE3o podem ser alteradas.");
        }
        if (existingRoute.status === "CANCELLED") {
          throw new Error("CANNOT_EDIT_CANCELLED_ROUTE: Rotas canceladas n\xE3o podem ser alteradas.");
        }
        if (editData.expected_version !== existingRoute.route_version) {
          throw new Error(
            "CONCURRENT_MODIFICATION_CONFLICT: Esta rota foi alterada por outro processo. Recarregue os dados antes de continuar."
          );
        }
        const analysis = this.classifyRouteEdit(existingRoute, editData);
        const oldVersion = existingRoute.route_version;
        const newVersion = oldVersion + 1;
        if (analysis.is_material && ["ACCEPTED", "ARRIVED_PICKUP", "PICKED_UP", "IN_TRANSIT"].includes(existingRoute.status)) {
          await db.update(routeUpdates).set({
            driver_approval_status: "REJECTED",
            driver_decision_at: sql4`NOW()`
          }).where(
            and3(
              eq3(routeUpdates.route_id, routeId),
              eq3(routeUpdates.driver_approval_status, "PENDING")
            )
          );
          const [updateRecord2] = await db.insert(routeUpdates).values({
            route_id: routeId,
            old_version: oldVersion,
            new_version: newVersion,
            change_type: "MATERIAL",
            changed_fields: JSON.stringify(analysis.changed_fields),
            diff_summary: analysis.diff_summary,
            previous_snapshot: JSON.stringify(existingRoute),
            new_snapshot: null,
            // Pendente de aprovação
            pending_proposal: JSON.stringify(editData),
            actor,
            driver_approval_status: "PENDING"
          }).returning();
          await db.update(routes).set({
            change_pending_driver_approval: true,
            pending_material_change: JSON.stringify({
              status: "PENDING",
              update_id: updateRecord2.id,
              proposed_version: newVersion,
              diff_summary: analysis.diff_summary,
              proposal: editData,
              actor,
              created_at: (/* @__PURE__ */ new Date()).toISOString()
            })
          }).where(
            and3(
              eq3(routes.id, routeId),
              eq3(routes.route_version, oldVersion)
            )
          );
          if (existingRoute.accepted_driver_id) {
            const driver = await driverService.getDriverById(existingRoute.accepted_driver_id);
            const chatId = driver?.telegram_chat_id || driver?.telegram_user_id;
            if (chatId) {
              await telegramBot.sendRouteMaterialChangeProposal(
                chatId,
                existingRoute,
                updateRecord2.id,
                analysis.diff_summary
              );
            }
          }
          const refreshedRoute = await routeService.getRouteById(routeId);
          return {
            status: "PENDING_DRIVER_APPROVAL",
            route: refreshedRoute,
            update_id: updateRecord2.id,
            diff_summary: analysis.diff_summary,
            change_type: "MATERIAL"
          };
        }
        const updateFields = {
          route_version: newVersion
        };
        if (editData.final_deadline) {
          updateFields.final_deadline = editData.final_deadline.trim();
        }
        if (editData.total_fee) {
          updateFields.total_fee = editData.total_fee.trim();
        }
        if (editData.final_driver_fee !== void 0 && editData.final_driver_fee !== null) {
          const parsedFee = parseFloat(String(editData.final_driver_fee).replace(",", "."));
          if (!isNaN(parsedFee)) {
            updateFields.final_driver_fee = parsedFee.toFixed(2);
            updateFields.total_fee = parsedFee.toFixed(2).replace(".", ",");
          }
        }
        if (editData.override_reason !== void 0) {
          updateFields.override_reason = editData.override_reason?.trim() || null;
        }
        if (editData.pickup_name) {
          updateFields.pickup_name = editData.pickup_name.trim();
        }
        if (editData.pickup_address) {
          updateFields.pickup_address = editData.pickup_address.trim();
        }
        if (editData.pickup_neighborhood) {
          updateFields.pickup_neighborhood_snapshot = editData.pickup_neighborhood.trim();
        }
        if (editData.pickup_location_id !== void 0) {
          updateFields.pickup_location_id = editData.pickup_location_id;
        }
        if (editData.accepted_vehicle_types) {
          updateFields.accepted_vehicle_types = JSON.stringify(editData.accepted_vehicle_types);
        }
        const updateResult = await db.update(routes).set(updateFields).where(
          and3(
            eq3(routes.id, routeId),
            eq3(routes.route_version, editData.expected_version)
          )
        ).returning();
        if (updateResult.length === 0) {
          throw new Error(
            "CONCURRENT_MODIFICATION_CONFLICT: Esta rota foi alterada por outro processo. Recarregue os dados antes de continuar."
          );
        }
        if (editData.stops && editData.stops.length > 0) {
          const incomingStopIds = editData.stops.filter((s) => !!s.id).map((s) => s.id);
          const existingStops = existingRoute.stops || [];
          for (const exStop of existingStops) {
            if (!incomingStopIds.includes(exStop.id) && exStop.status === "PENDING") {
              await db.delete(routeStops).where(and3(eq3(routeStops.id, exStop.id), eq3(routeStops.route_id, routeId)));
            }
          }
          for (let i = 0; i < editData.stops.length; i++) {
            const s = editData.stops[i];
            if (s.id) {
              const stopUpdateData = {};
              if (s.destination_address) stopUpdateData.destination_address = s.destination_address.trim();
              if (s.destination_neighborhood) stopUpdateData.destination_neighborhood = s.destination_neighborhood.trim();
              if (s.cargo_description) stopUpdateData.cargo_description = s.cargo_description.trim();
              if (s.desired_deadline !== void 0) stopUpdateData.desired_deadline = s.desired_deadline?.trim() || null;
              if (s.observations !== void 0) stopUpdateData.observations = s.observations?.trim() || null;
              if (s.delivery_mode) stopUpdateData.delivery_mode = s.delivery_mode;
              if (s.sequence) stopUpdateData.sequence = s.sequence;
              await db.update(routeStops).set(stopUpdateData).where(eq3(routeStops.id, s.id));
            } else {
              const randomPin = Math.floor(1e3 + Math.random() * 9e3).toString();
              await db.insert(routeStops).values({
                route_id: routeId,
                sequence: s.sequence || i + 1,
                destination_address: s.destination_address.trim(),
                destination_neighborhood: s.destination_neighborhood.trim(),
                cargo_description: s.cargo_description.trim(),
                observations: s.observations?.trim() || null,
                desired_deadline: s.desired_deadline?.trim() || null,
                delivery_mode: s.delivery_mode || "IN_PERSON",
                pin_code: randomPin,
                status: "PENDING"
              });
            }
          }
        }
        const updatedRoute = await routeService.getRouteById(routeId);
        const [updateRecord] = await db.insert(routeUpdates).values({
          route_id: routeId,
          old_version: oldVersion,
          new_version: newVersion,
          change_type: analysis.change_type,
          changed_fields: JSON.stringify(analysis.changed_fields),
          diff_summary: analysis.diff_summary,
          previous_snapshot: JSON.stringify(existingRoute),
          new_snapshot: JSON.stringify(updatedRoute),
          actor,
          driver_approval_status: "NOT_REQUIRED"
        }).returning();
        await db.insert(routeEvents).values({
          route_id: routeId,
          event_type: "ROUTE_UPDATED",
          actor,
          details: `Version ${oldVersion} -> ${newVersion} (${analysis.change_type}): ${analysis.diff_summary}`
        });
        let reofferStats = void 0;
        if (existingRoute.status === "OFFERED") {
          const oldDispatches = await db.select().from(routeOfferDispatches).where(
            and3(
              eq3(routeOfferDispatches.route_id, routeId),
              eq3(routeOfferDispatches.route_version, oldVersion),
              eq3(routeOfferDispatches.status, "SENT")
            )
          );
          let oldInvalidated = 0;
          let oldFailed = 0;
          await Promise.allSettled(
            oldDispatches.map(async (disp) => {
              try {
                const invRes = await telegramBot.invalidateRouteOfferForVersion(
                  disp.telegram_chat_id,
                  disp.telegram_message_id,
                  routeId,
                  oldVersion,
                  newVersion
                );
                if (invRes.success) {
                  oldInvalidated++;
                } else {
                  oldFailed++;
                }
                console.info(
                  `[RouteEdit.invalidateOldOffer] route_id=${routeId} old_version=${oldVersion} new_version=${newVersion} dispatch_id=${disp.id} driver_id=${disp.driver_id} result=${invRes.mode}` + (invRes.error ? ` error=${invRes.error}` : "")
                );
              } catch (err) {
                oldFailed++;
                console.error(
                  `[RouteEdit.invalidateOldOffer] route_id=${routeId} old_version=${oldVersion} new_version=${newVersion} dispatch_id=${disp.id} driver_id=${disp.driver_id} result=FAILED error=${err.message}`
                );
              }
            })
          );
          await db.insert(routeEvents).values({
            route_id: routeId,
            event_type: "OLD_ROUTE_OFFER_INVALIDATED",
            actor,
            details: `Version ${oldVersion} invalidated for ${oldDispatches.length} driver(s): ${oldInvalidated} successfully invalidated, ${oldFailed} failed`
          });
          const pubResult = await routeService.publishRoute(routeId, actor, { isRepublish: true });
          await db.insert(routeEvents).values({
            route_id: routeId,
            event_type: "ROUTE_REOFFERED",
            actor,
            details: `Reoffered v${newVersion} to ${pubResult.dispatches.length} eligible driver(s): ${pubResult.stats.sent} sent, ${pubResult.stats.failed} failed`
          });
          reofferStats = {
            old_version: oldVersion,
            new_version: newVersion,
            old_dispatches_count: oldDispatches.length,
            old_dispatches_invalidated: oldInvalidated,
            old_dispatches_failed: oldFailed,
            eligible_drivers_count: pubResult.dispatches.length,
            new_offers_sent: pubResult.stats.sent,
            new_offers_failed: pubResult.stats.failed
          };
        }
        if (["ACCEPTED", "ARRIVED_PICKUP", "PICKED_UP", "IN_TRANSIT"].includes(existingRoute.status)) {
          if (existingRoute.accepted_driver_id) {
            const driver = await driverService.getDriverById(existingRoute.accepted_driver_id);
            if (driver?.telegram_chat_id) {
              await telegramBot.sendRouteOperationalUpdate(
                driver.telegram_chat_id,
                updatedRoute,
                oldVersion,
                newVersion,
                analysis.diff_summary
              );
            }
          }
        }
        return {
          status: "APPLIED",
          route: updatedRoute,
          update_id: updateRecord.id,
          diff_summary: analysis.diff_summary,
          change_type: analysis.change_type,
          reoffer_stats: reofferStats
        };
      }
      /**
       * Processa a decisão do motorista referente a uma alteração material proposta.
       */
      async handleDriverMaterialDecision(routeId, updateId, driverId, decision) {
        const route = await routeService.getRouteById(routeId);
        if (!route) throw new Error("ROUTE_NOT_FOUND");
        if (route.accepted_driver_id !== driverId) {
          throw new Error("UNAUTHORIZED_DRIVER: Apenas o motorista vencedor pode responder a esta altera\xE7\xE3o.");
        }
        const [updateRecord] = await db.select().from(routeUpdates).where(
          and3(
            eq3(routeUpdates.id, updateId),
            eq3(routeUpdates.route_id, routeId)
          )
        );
        if (!updateRecord || updateRecord.driver_approval_status !== "PENDING") {
          throw new Error("INVALID_OR_ALREADY_PROCESSED: Esta solicita\xE7\xE3o de altera\xE7\xE3o j\xE1 foi processada.");
        }
        const driver = await driverService.getDriverById(driverId);
        const proposal = JSON.parse(updateRecord.pending_proposal || "{}");
        if (decision === "ACCEPT") {
          const newVersion = updateRecord.new_version;
          const updateFields = {
            route_version: newVersion,
            driver_acknowledged_version: newVersion,
            change_pending_driver_approval: false,
            pending_material_change: null
          };
          if (proposal.final_driver_fee !== void 0 && proposal.final_driver_fee !== null) {
            const parsedFee = parseFloat(String(proposal.final_driver_fee).replace(",", "."));
            if (!isNaN(parsedFee)) {
              updateFields.final_driver_fee = parsedFee.toFixed(2);
              updateFields.total_fee = parsedFee.toFixed(2).replace(".", ",");
            }
          }
          if (proposal.final_deadline) updateFields.final_deadline = proposal.final_deadline.trim();
          if (proposal.pickup_name) updateFields.pickup_name = proposal.pickup_name.trim();
          if (proposal.pickup_address) updateFields.pickup_address = proposal.pickup_address.trim();
          if (proposal.pickup_neighborhood) updateFields.pickup_neighborhood_snapshot = proposal.pickup_neighborhood.trim();
          if (proposal.pickup_location_id !== void 0) updateFields.pickup_location_id = proposal.pickup_location_id;
          await db.update(routes).set(updateFields).where(eq3(routes.id, routeId));
          if (proposal.stops && proposal.stops.length > 0) {
            const existingStops = route.stops || [];
            for (const s of proposal.stops) {
              if (s.id) {
                await db.update(routeStops).set({
                  destination_address: s.destination_address.trim(),
                  destination_neighborhood: s.destination_neighborhood.trim(),
                  cargo_description: s.cargo_description.trim(),
                  desired_deadline: s.desired_deadline?.trim() || null,
                  observations: s.observations?.trim() || null,
                  delivery_mode: s.delivery_mode || "IN_PERSON",
                  sequence: s.sequence || 1
                }).where(eq3(routeStops.id, s.id));
              } else {
                const nextSeq = s.sequence || existingStops.length + 1;
                const pinCode = String(Math.floor(1e3 + Math.random() * 9e3));
                await db.insert(routeStops).values({
                  route_id: routeId,
                  sequence: nextSeq,
                  destination_address: s.destination_address.trim(),
                  destination_neighborhood: s.destination_neighborhood.trim(),
                  cargo_description: s.cargo_description.trim(),
                  delivery_mode: s.delivery_mode || "IN_PERSON",
                  desired_deadline: s.desired_deadline?.trim() || null,
                  observations: s.observations?.trim() || null,
                  pin_code: pinCode,
                  status: "PENDING",
                  modality_code: s.modality_code || "CONVENCIONAL"
                });
              }
            }
          }
          const refreshedRoute = await routeService.getRouteById(routeId);
          await db.update(routeUpdates).set({
            driver_approval_status: "ACCEPTED",
            driver_decision_at: sql4`NOW()`,
            driver_acknowledged_at: sql4`NOW()`,
            new_snapshot: JSON.stringify(refreshedRoute)
          }).where(eq3(routeUpdates.id, updateId));
          await db.insert(routeEvents).values({
            route_id: routeId,
            event_type: "ROUTE_CHANGE_ACCEPTED",
            actor: `DRIVER #${driverId}`,
            details: `Driver accepted material change to version ${newVersion}`
          });
          const chatId = driver?.telegram_chat_id || driver?.telegram_user_id;
          if (chatId) {
            await telegramBot.sendRouteMaterialDecisionConfirmation(
              chatId,
              refreshedRoute,
              true
            );
          }
          return { status: "ACCEPTED", route: refreshedRoute };
        } else {
          const rejectedPayload = JSON.stringify({
            status: "REJECTED",
            update_id: updateId,
            diff_summary: updateRecord.diff_summary,
            proposal,
            rejected_at: (/* @__PURE__ */ new Date()).toISOString()
          });
          await db.update(routes).set({
            change_pending_driver_approval: false,
            pending_material_change: rejectedPayload
          }).where(eq3(routes.id, routeId));
          await db.update(routeUpdates).set({
            driver_approval_status: "REJECTED",
            driver_decision_at: sql4`NOW()`
          }).where(eq3(routeUpdates.id, updateId));
          await db.insert(routeEvents).values({
            route_id: routeId,
            event_type: "ROUTE_CHANGE_REJECTED",
            actor: `DRIVER #${driverId}`,
            details: `Driver rejected material change proposal #${updateId}. Proposed changes preserved for attendant adjustment and renegotiation.`
          });
          const chatId = driver?.telegram_chat_id || driver?.telegram_user_id;
          if (chatId) {
            await telegramBot.sendRouteMaterialDecisionConfirmation(
              chatId,
              route,
              false
            );
          }
          const refreshedRoute = await routeService.getRouteById(routeId) || route;
          return { status: "REJECTED", route: refreshedRoute };
        }
      }
      /**
       * Processa confirmação de ciência do motorista para correções operacionais.
       */
      async handleDriverOperationalAck(routeId, version, driverId) {
        const route = await routeService.getRouteById(routeId);
        if (!route) return false;
        if (route.accepted_driver_id !== driverId) {
          return false;
        }
        await db.update(routes).set({
          driver_acknowledged_version: version
        }).where(eq3(routes.id, routeId));
        await db.update(routeUpdates).set({
          driver_acknowledged_at: sql4`NOW()`
        }).where(
          and3(
            eq3(routeUpdates.route_id, routeId),
            eq3(routeUpdates.new_version, version)
          )
        );
        await db.insert(routeEvents).values({
          route_id: routeId,
          event_type: "ROUTE_CHANGE_ACKNOWLEDGED",
          actor: `DRIVER #${driverId}`,
          details: `Driver acknowledged operational update version ${version}`
        });
        return true;
      }
      /**
       * Retorna o histórico de versões e auditoria de uma rota.
       */
      async getRouteUpdates(routeId) {
        const rows = await db.select().from(routeUpdates).where(eq3(routeUpdates.route_id, routeId)).orderBy(sql4`${routeUpdates.created_at} DESC`);
        return rows.map((r) => ({
          id: r.id,
          route_id: r.route_id,
          old_version: r.old_version,
          new_version: r.new_version,
          change_type: r.change_type,
          changed_fields: JSON.parse(r.changed_fields || "[]"),
          diff_summary: r.diff_summary,
          previous_snapshot: JSON.parse(r.previous_snapshot || "{}"),
          new_snapshot: r.new_snapshot ? JSON.parse(r.new_snapshot) : null,
          pending_proposal: r.pending_proposal ? JSON.parse(r.pending_proposal) : null,
          actor: r.actor,
          driver_approval_status: r.driver_approval_status,
          driver_decision_at: r.driver_decision_at,
          driver_acknowledged_at: r.driver_acknowledged_at,
          created_at: r.created_at
        }));
      }
      /**
       * Descarta a proposta material rejeitada e restaura a rota para o estado estável da versão atual.
       */
      async discardRejectedProposal(routeId, actor) {
        await db.update(routes).set({
          pending_material_change: null,
          change_pending_driver_approval: false
        }).where(eq3(routes.id, routeId));
        await db.insert(routeEvents).values({
          route_id: routeId,
          event_type: "ROUTE_CHANGE_DISCARDED",
          actor,
          details: "Attendant discarded rejected material change proposal. Route maintained in current version."
        });
      }
    };
    routeEditService = new RouteEditService();
  }
});

// src/server/referralService.ts
var referralService_exports = {};
__export(referralService_exports, {
  ReferralService: () => ReferralService,
  referralService: () => referralService
});
import crypto from "crypto";
import { eq as eq4, desc as desc3, and as and4, sql as sql5 } from "drizzle-orm";
var ReferralService, referralService;
var init_referralService = __esm({
  "src/server/referralService.ts"() {
    init_db();
    init_schema();
    init_telegramBot();
    ReferralService = class {
      /**
       * Normalizes Brazilian phone number to canonical format +55DD9XXXXXXXX or +55DDXXXXXXXX
       */
      normalizePhone(raw) {
        const digits = raw.replace(/\D/g, "");
        if (digits.length === 11) {
          return `+55${digits}`;
        }
        if (digits.length === 10) {
          return `+55${digits}`;
        }
        if (digits.length === 13 && digits.startsWith("55")) {
          return `+${digits}`;
        }
        if (digits.length === 12 && digits.startsWith("55")) {
          return `+${digits}`;
        }
        if (digits.length >= 10 && digits.length <= 11) {
          return `+55${digits}`;
        }
        throw new Error("TELEFONE_INVALIDO: Informe um telefone celular v\xE1lido com DDD.");
      }
      /**
       * Formats phone number for display, e.g. (34) 99999-9999
       */
      formatPhoneDisplay(canonicalPhone) {
        const digits = canonicalPhone.replace(/\D/g, "");
        const local = digits.startsWith("55") ? digits.slice(2) : digits;
        if (local.length === 11) {
          return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
        }
        if (local.length === 10) {
          return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
        }
        return canonicalPhone;
      }
      /**
       * Section 4 & 6: Create new referral.
       * STRICT SECURITY: Only ACTIVE drivers can refer!
       * Validated server-side.
       */
      async createReferral(indicatorDriverId, referredName, referredPhone) {
        const indicator = await db.select().from(drivers).where(eq4(drivers.id, indicatorDriverId)).then((res) => res[0]);
        if (!indicator) {
          throw new Error("DRIVER_NOT_FOUND: Motorista indicador n\xE3o encontrado.");
        }
        if (indicator.status !== "ACTIVE") {
          throw new Error(
            "DRIVER_NOT_ACTIVE_CANNOT_REFER: Apenas motoristas ATIVOS podem realizar indica\xE7\xF5es."
          );
        }
        const trimmedName = referredName.trim();
        if (trimmedName.length < 2) {
          throw new Error("NOME_INVALIDO: O nome do indicado deve ter pelo menos 2 caracteres.");
        }
        const canonicalPhone = this.normalizePhone(referredPhone);
        const [referral] = await db.insert(driverReferrals).values({
          referred_by_driver_id: indicatorDriverId,
          referred_name: trimmedName,
          referred_phone: canonicalPhone,
          status: "PENDING_REVIEW"
        }).returning();
        await db.insert(driverReferralEvents).values({
          referral_id: referral.id,
          event_type: "DRIVER_REFERRAL_CREATED",
          actor_type: "DRIVER",
          actor_id: indicator.telegram_user_id,
          details: JSON.stringify({
            indicator_id: indicator.id,
            referred_name: trimmedName,
            referred_phone: canonicalPhone
          })
        });
        return referral;
      }
      /**
       * Helper: check and mark expired tokens automatically
       */
      async checkAndExpireReferrals() {
        try {
          const now = /* @__PURE__ */ new Date();
          const expiredList = await db.select().from(driverReferrals).where(
            and4(
              eq4(driverReferrals.status, "APPROVED"),
              sql5`${driverReferrals.invitation_expires_at} < ${now}`
            )
          );
          for (const ref of expiredList) {
            await db.update(driverReferrals).set({ status: "EXPIRED", updated_at: /* @__PURE__ */ new Date() }).where(eq4(driverReferrals.id, ref.id));
            await db.insert(driverReferralEvents).values({
              referral_id: ref.id,
              event_type: "DRIVER_REFERRAL_EXPIRED",
              actor_type: "SYSTEM",
              details: "Token de convite ultrapassou o prazo de 7 dias sem consumo v\xE1lido."
            });
          }
        } catch (err) {
          console.warn("[ReferralService.checkAndExpireReferrals error]", err.message);
        }
      }
      /**
       * Section 12: Admin listing of referrals with indicator details (NO PIX)
       */
      async getReferrals(filters) {
        await this.checkAndExpireReferrals();
        let query = db.select().from(driverReferrals);
        if (filters?.status) {
          query = query.where(eq4(driverReferrals.status, filters.status));
        }
        const rows = await query.orderBy(desc3(driverReferrals.created_at));
        const allDrivers = await db.select().from(drivers);
        const driverMap = /* @__PURE__ */ new Map();
        for (const d of allDrivers) {
          driverMap.set(d.id, d);
        }
        const botStatus = telegramBot.getStatus();
        const botUsername = botStatus.botUsername || process.env.TELEGRAM_BOT_USERNAME || "KantineEntregasbot";
        const result = rows.map((r) => {
          const indicator = driverMap.get(r.referred_by_driver_id);
          const resulting = r.resulting_driver_id ? driverMap.get(r.resulting_driver_id) : null;
          let inviteLink = null;
          if (r.invitation_token && r.status === "APPROVED") {
            inviteLink = `https://t.me/${botUsername}?start=invite_${r.invitation_token}`;
          }
          return {
            ...r,
            referred_by_driver: indicator ? {
              id: indicator.id,
              name: indicator.name,
              status: indicator.status,
              vehicle_type: indicator.vehicle_type
              // Strictly NO Pix exposed
            } : null,
            resulting_driver: resulting ? {
              id: resulting.id,
              name: resulting.name,
              status: resulting.status
            } : null,
            invite_link: inviteLink
          };
        });
        if (filters?.search) {
          const q = filters.search.toLowerCase();
          return result.filter(
            (r) => r.referred_name.toLowerCase().includes(q) || r.referred_phone.includes(q) || r.referred_by_driver?.name.toLowerCase().includes(q)
          );
        }
        return result;
      }
      /**
       * Section 18 & 19: Get referrals by indicator driver ID for [📋 MINHAS INDICAÇÕES]
       */
      async getReferralsByDriverId(driverId) {
        await this.checkAndExpireReferrals();
        const rows = await db.select().from(driverReferrals).where(eq4(driverReferrals.referred_by_driver_id, driverId)).orderBy(desc3(driverReferrals.created_at));
        const botStatus = telegramBot.getStatus();
        const botUsername = botStatus.botUsername || process.env.TELEGRAM_BOT_USERNAME || "KantineEntregasbot";
        const resultingIds = rows.map((r) => r.resulting_driver_id).filter((id) => id !== null && id !== void 0);
        const resultingDriversMap = /* @__PURE__ */ new Map();
        if (resultingIds.length > 0) {
          const resDrivers = await db.select().from(drivers);
          for (const d of resDrivers) {
            if (resultingIds.includes(d.id)) {
              resultingDriversMap.set(d.id, d);
            }
          }
        }
        return rows.map((r) => {
          const resDriver = r.resulting_driver_id ? resultingDriversMap.get(r.resulting_driver_id) : null;
          let friendlyStatus = "EM AN\xC1LISE";
          let canInvite = false;
          let inviteLink = null;
          if (r.status === "PENDING_REVIEW") {
            friendlyStatus = "EM AN\xC1LISE";
          } else if (r.status === "APPROVED") {
            friendlyStatus = "APROVADA \u2014 AGUARDANDO CADASTRO";
            canInvite = true;
            if (r.invitation_token) {
              inviteLink = `https://t.me/${botUsername}?start=invite_${r.invitation_token}`;
            }
          } else if (r.status === "INVITE_USED") {
            if (resDriver && resDriver.status === "ACTIVE") {
              friendlyStatus = "ATIVADO";
            } else {
              friendlyStatus = "CADASTRO REALIZADO / EM AN\xC1LISE";
            }
          } else if (r.status === "REJECTED") {
            friendlyStatus = "N\xC3O APROVADA";
          } else if (r.status === "EXPIRED") {
            friendlyStatus = "CONVITE EXPIRADO";
          }
          return {
            id: r.id,
            referred_name: r.referred_name,
            referred_phone: r.referred_phone,
            status: r.status,
            friendly_status: friendlyStatus,
            invitation_expires_at: r.invitation_expires_at,
            invite_link: inviteLink,
            can_invite: canInvite,
            resulting_driver_status: resDriver ? resDriver.status : null,
            created_at: r.created_at
          };
        });
      }
      /**
       * Section 13: Approve referral (Admin only)
       * Generates secure 7-day single-use token, notifies indicator driver via Telegram.
       */
      async approveReferral(referralId, adminActor) {
        const existing = await db.select().from(driverReferrals).where(eq4(driverReferrals.id, referralId)).then((res) => res[0]);
        if (!existing) {
          throw new Error("REFERRAL_NOT_FOUND: Indica\xE7\xE3o n\xE3o encontrada.");
        }
        if (existing.status !== "PENDING_REVIEW") {
          throw new Error(`CANNOT_APPROVE_REFERRAL: Indica\xE7\xE3o j\xE1 est\xE1 no status ${existing.status}.`);
        }
        const token = crypto.randomBytes(16).toString("hex");
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1e3);
        const [updated] = await db.update(driverReferrals).set({
          status: "APPROVED",
          invitation_token: token,
          invitation_expires_at: expiresAt,
          reviewed_at: /* @__PURE__ */ new Date(),
          reviewed_by: adminActor,
          updated_at: /* @__PURE__ */ new Date()
        }).where(eq4(driverReferrals.id, referralId)).returning();
        await db.insert(driverReferralEvents).values({
          referral_id: referralId,
          event_type: "DRIVER_REFERRAL_APPROVED",
          actor_type: "ADMIN",
          actor_id: adminActor,
          details: JSON.stringify({
            token_hash: crypto.createHash("sha256").update(token).digest("hex").slice(0, 16),
            expires_at: expiresAt.toISOString()
          })
        });
        const botStatus = telegramBot.getStatus();
        const botUsername = botStatus.botUsername || process.env.TELEGRAM_BOT_USERNAME || "KantineEntregasbot";
        const inviteLink = `https://t.me/${botUsername}?start=invite_${token}`;
        try {
          const indicator = await db.select().from(drivers).where(eq4(drivers.id, existing.referred_by_driver_id)).then((res) => res[0]);
          if (indicator && indicator.telegram_chat_id) {
            const expiresDisplay = expiresAt.toLocaleDateString("pt-BR");
            const firstName = existing.referred_name.split(" ")[0] || existing.referred_name;
            const notifyMsg = `\u2705 *INDICA\xC7\xC3O APROVADA*

*${existing.referred_name}* foi autorizado(a) a realizar o cadastro.

O convite \xE9 v\xE1lido por 7 dias (at\xE9 ${expiresDisplay}) e pode ser usado uma \xFAnica vez.

\u{1F517} *Link do Convite:*
\`${inviteLink}\`

Encaminhe este link para ${firstName} para que ele(a) possa iniciar o cadastro.`;
            await telegramBot.sendMessage(indicator.telegram_chat_id, notifyMsg, {
              parse_mode: "Markdown",
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: `\u{1F4E8} COMPARTILHAR COM ${firstName.toUpperCase()}`,
                      url: `https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent(
                        `Ol\xE1 ${firstName}! Seu convite para se cadastrar na Kantine Entregas foi aprovado. Acesse o link para iniciar seu cadastro:`
                      )}`
                    }
                  ],
                  [{ text: "\u{1F4CB} MINHAS INDICA\xC7\xD5ES", callback_data: "menu_my_referrals" }]
                ]
              }
            });
          }
        } catch (notifErr) {
          console.warn("[ReferralService] Could not send approval Telegram notification to indicator:", notifErr.message);
        }
        return {
          referral: updated,
          inviteLink
        };
      }
      /**
       * Section 14: Reject referral (Admin only)
       */
      async rejectReferral(referralId, adminActor, reason) {
        const existing = await db.select().from(driverReferrals).where(eq4(driverReferrals.id, referralId)).then((res) => res[0]);
        if (!existing) {
          throw new Error("REFERRAL_NOT_FOUND: Indica\xE7\xE3o n\xE3o encontrada.");
        }
        if (existing.status !== "PENDING_REVIEW") {
          throw new Error(`CANNOT_REJECT_REFERRAL: Indica\xE7\xE3o j\xE1 est\xE1 no status ${existing.status}.`);
        }
        const trimmedReason = reason?.trim() || null;
        const [updated] = await db.update(driverReferrals).set({
          status: "REJECTED",
          reviewed_at: /* @__PURE__ */ new Date(),
          reviewed_by: adminActor,
          rejection_reason: trimmedReason,
          updated_at: /* @__PURE__ */ new Date()
        }).where(eq4(driverReferrals.id, referralId)).returning();
        await db.insert(driverReferralEvents).values({
          referral_id: referralId,
          event_type: "DRIVER_REFERRAL_REJECTED",
          actor_type: "ADMIN",
          actor_id: adminActor,
          details: trimmedReason || void 0
        });
        return updated;
      }
      /**
       * Section 22: Validate invite token
       */
      async validateInviteToken(rawToken) {
        if (!rawToken || !rawToken.trim()) {
          return { valid: false, error: "TOKEN_REQUIRED", message: "Token de convite n\xE3o fornecido." };
        }
        const cleanToken = rawToken.replace(/^invite_/, "").trim();
        const referral = await db.select().from(driverReferrals).where(eq4(driverReferrals.invitation_token, cleanToken)).then((res) => res[0]);
        if (!referral) {
          return {
            valid: false,
            error: "TOKEN_NOT_FOUND",
            message: "Convite n\xE3o encontrado ou inv\xE1lido."
          };
        }
        if (referral.invitation_expires_at && /* @__PURE__ */ new Date() > new Date(referral.invitation_expires_at)) {
          if (referral.status !== "EXPIRED") {
            await db.update(driverReferrals).set({ status: "EXPIRED", updated_at: /* @__PURE__ */ new Date() }).where(eq4(driverReferrals.id, referral.id));
            await db.insert(driverReferralEvents).values({
              referral_id: referral.id,
              event_type: "DRIVER_REFERRAL_EXPIRED",
              actor_type: "SYSTEM",
              details: "Convite expirado verificado na tentativa de consumo."
            });
          }
          return {
            valid: false,
            error: "TOKEN_EXPIRED",
            message: "Este convite expirou. Pe\xE7a ao motorista que realizou sua indica\xE7\xE3o para solicitar uma nova autoriza\xE7\xE3o \xE0 Kantine."
          };
        }
        if (referral.status === "REJECTED") {
          return {
            valid: false,
            error: "TOKEN_REJECTED",
            message: "Esta indica\xE7\xE3o foi cancelada ou n\xE3o foi aprovada."
          };
        }
        if (referral.status === "EXPIRED") {
          return {
            valid: false,
            error: "TOKEN_EXPIRED",
            message: "Este convite expirou. Pe\xE7a ao motorista que realizou sua indica\xE7\xE3o para solicitar uma nova autoriza\xE7\xE3o \xE0 Kantine."
          };
        }
        if (referral.status === "INVITE_USED") {
          return {
            valid: true,
            referral,
            alreadyBoundUser: referral.invited_telegram_user_id || null
          };
        }
        if (referral.status === "APPROVED") {
          return {
            valid: true,
            referral,
            alreadyBoundUser: null
          };
        }
        return {
          valid: false,
          error: "INVALID_STATUS",
          message: "Este convite ainda n\xE3o est\xE1 dispon\xEDvel para uso."
        };
      }
      /**
       * Section 22, 23, 24: Consume and bind invite token to Telegram User ID
       * Atomic binding: Once bound to Telegram User ID, João cannot use Carlos's invite.
       * Legitimate retry of SAME user is allowed.
       */
      async consumeInvite(rawToken, telegramUserId) {
        const cleanToken = rawToken.replace(/^invite_/, "").trim();
        const validation = await this.validateInviteToken(cleanToken);
        if (!validation.valid || !validation.referral) {
          throw new Error(validation.error || "INVALID_INVITE_TOKEN");
        }
        const ref = validation.referral;
        if (ref.invited_telegram_user_id) {
          if (ref.invited_telegram_user_id !== telegramUserId) {
            throw new Error("TOKEN_ALREADY_USED_BY_ANOTHER_USER: Este convite j\xE1 foi utilizado por outro usu\xE1rio.");
          }
          return ref;
        }
        const [updated] = await db.update(driverReferrals).set({
          status: "INVITE_USED",
          invited_telegram_user_id: telegramUserId,
          invitation_used_at: /* @__PURE__ */ new Date(),
          updated_at: /* @__PURE__ */ new Date()
        }).where(and4(eq4(driverReferrals.id, ref.id), eq4(driverReferrals.status, "APPROVED"))).returning();
        if (!updated) {
          const current = await db.select().from(driverReferrals).where(eq4(driverReferrals.id, ref.id)).then((r) => r[0]);
          if (current && current.invited_telegram_user_id === telegramUserId) {
            return current;
          }
          throw new Error("TOKEN_ALREADY_USED_BY_ANOTHER_USER: Este convite j\xE1 foi utilizado por outro usu\xE1rio.");
        }
        await db.insert(driverReferralEvents).values({
          referral_id: ref.id,
          event_type: "DRIVER_INVITE_CONSUMED",
          actor_type: "DRIVER",
          actor_id: telegramUserId,
          details: JSON.stringify({
            telegram_user_id: telegramUserId,
            consumed_at: (/* @__PURE__ */ new Date()).toISOString()
          })
        });
        return updated;
      }
      /**
       * Associate the completed driver registration to the referral
       */
      async linkResultingDriver(referralId, driverId) {
        await db.update(driverReferrals).set({
          resulting_driver_id: driverId,
          updated_at: /* @__PURE__ */ new Date()
        }).where(eq4(driverReferrals.id, referralId));
      }
      /**
       * Find referral by invited telegram user ID
       */
      async getReferralByInvitedTelegramUser(telegramUserId) {
        const res = await db.select().from(driverReferrals).where(eq4(driverReferrals.invited_telegram_user_id, telegramUserId)).then((r) => r[0]);
        return res || null;
      }
      /**
       * Audit events for a referral
       */
      async getReferralEvents(referralId) {
        return db.select().from(driverReferralEvents).where(eq4(driverReferralEvents.referral_id, referralId)).orderBy(desc3(driverReferralEvents.timestamp));
      }
    };
    referralService = new ReferralService();
  }
});

// src/server/telegramBot.ts
import { eq as eq5 } from "drizzle-orm";
function isMockChatId(chatId) {
  if (!chatId) return true;
  const str = String(chatId).trim();
  if (/^(chat_|test_|mock_|fake_|sample_|invalid_|tg_)/i.test(str)) return true;
  if (!str.startsWith("@") && !/^-?\d+$/.test(str)) return true;
  return false;
}
function buildRouteOfferClosedText(route) {
  const stopsCount = route.stops?.length || 1;
  const stopsHeader = stopsCount === 1 ? "1 ENTREGA" : `${stopsCount} ENTREGAS`;
  const numberEmojis = ["0\uFE0F\u20E3", "1\uFE0F\u20E3", "2\uFE0F\u20E3", "3\uFE0F\u20E3", "4\uFE0F\u20E3", "5\uFE0F\u20E3", "6\uFE0F\u20E3", "7\uFE0F\u20E3", "8\uFE0F\u20E3", "9\uFE0F\u20E3", "\u{1F51F}"];
  let stopsText = "";
  if (route.stops && route.stops.length > 0) {
    stopsText = route.stops.map((s, idx) => {
      const numEmoji = idx + 1 <= 10 ? numberEmojis[idx + 1] : `#${idx + 1}`;
      const deadlineLine = s.desired_deadline?.trim() ? `
\u23F1\uFE0F Desej\xE1vel: ${s.desired_deadline.trim()}` : "";
      return `${numEmoji} ${s.destination_neighborhood}${deadlineLine}`;
    }).join("\n\n");
  }
  const totalNum = parseFloat(String(route.total_fee || "0").replace(",", ".")) || 0;
  const storeRate = route.management_rate_snapshot != null && !isNaN(parseFloat(String(route.management_rate_snapshot))) ? parseFloat(String(route.management_rate_snapshot)) : 0.1;
  const driverFeeNum = Math.round(totalNum * (1 - storeRate) * 100) / 100;
  const driverFeeStr = driverFeeNum.toFixed(2).replace(".", ",");
  let feeStr = (route.total_fee || "").trim();
  if (!feeStr.includes(",")) {
    const num = parseFloat(feeStr);
    if (!isNaN(num)) feeStr = num.toFixed(2).replace(".", ",");
  }
  const pickupNeighborhood = route.pickup_neighborhood_snapshot?.trim();
  const pickupNeighborhoodLine = pickupNeighborhood ? `
Bairro: ${pickupNeighborhood}` : "";
  return `\u{1F512} *CORRIDA #${route.id} \u2014 ROTA J\xC1 ACEITA POR OUTRO MOTORISTA*
\u{1F194} *Corrida:* #${route.id}

\u{1F4CD} *RETIRADA:*
${route.pickup_name}${pickupNeighborhoodLine}

\u{1F4E6} *${stopsHeader}*

${stopsText}

\u{1F3C1} *ENCERRAMENTO M\xC1XIMO:*
${route.final_deadline}

\u{1F4B0} *FRETE:*
R$ ${driverFeeStr}

\u{1F512} ROTA J\xC1 ACEITA POR OUTRO MOTORISTA`;
}
function buildRouteOfferReplacedText(routeId, oldVersion, newVersion) {
  return `\u{1F504} *ROTA #${routeId} (CORRIDA) \u2014 OFERTA ATUALIZADA*
\u{1F194} *Corrida:* #${routeId}

Esta vers\xE3o da oferta foi substitu\xEDda por uma nova vers\xE3o.
Consulte a nova oferta enviada abaixo.

\u2022 *Vers\xE3o anterior:* v${oldVersion}
\u2022 *Nova vers\xE3o:* v${newVersion}`;
}
function escapeHtml(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
var TelegramBotService, telegramBot;
var init_telegramBot = __esm({
  "src/server/telegramBot.ts"() {
    init_types();
    init_pixValidation();
    init_mapsNavigation();
    init_routeEditService();
    init_db();
    init_schema();
    TelegramBotService = class {
      constructor() {
        this.token = null;
        this.isPolling = false;
        this.shouldStop = false;
        this.offset = 0;
        this.sessions = /* @__PURE__ */ new Map();
        this.editSessions = /* @__PURE__ */ new Map();
        this.m4DriverSessions = /* @__PURE__ */ new Map();
        this.referralSessions = /* @__PURE__ */ new Map();
        this.reactivationSessions = /* @__PURE__ */ new Map();
        this.botInfo = null;
        this.driverService = null;
        this.deliveryService = null;
        this.routeService = null;
        this.referralService = null;
        this.recentDispatches = [];
        this.updateTokenFromEnv();
      }
      getRecentDispatches() {
        return [...this.recentDispatches];
      }
      clearRecentDispatches() {
        this.recentDispatches = [];
      }
      recordRecentDispatch(entry) {
        this.recentDispatches.push(entry);
        if (this.recentDispatches.length > 200) {
          this.recentDispatches.shift();
        }
      }
      /**
       * Resolve public file URL from Telegram file_id (for photo proof viewing)
       */
      async getFileUrl(fileId) {
        if (!this.token || !fileId) return null;
        try {
          const res = await this.callTelegramApi("getFile", { file_id: fileId });
          if (res && res.file_path) {
            return `https://api.telegram.org/file/bot${this.token}/${res.file_path}`;
          }
          return null;
        } catch (err) {
          console.warn("[TelegramBot.getFileUrl] Error:", err.message);
          return null;
        }
      }
      updateTokenFromEnv(customToken) {
        const raw = customToken || process.env.TELEGRAM_BOT_TOKEN;
        if (raw && raw.trim() && raw.trim() !== "MY_TELEGRAM_BOT_TOKEN") {
          this.token = raw.trim();
        } else {
          this.token = null;
        }
      }
      setDriverService(service) {
        this.driverService = service;
      }
      setDeliveryService(service) {
        this.deliveryService = service;
      }
      setRouteService(service) {
        this.routeService = service;
      }
      setReferralService(service) {
        this.referralService = service;
      }
      isConfigured() {
        return !!this.token;
      }
      async getSession(telegramUserId) {
        try {
          const res = await db.select().from(telegramBotSessions).where(eq5(telegramBotSessions.userId, telegramUserId));
          if (res && res[0] && res[0].sessionType === "WIZARD") {
            const rawData = typeof res[0].data === "string" ? JSON.parse(res[0].data) : res[0].data;
            const loaded = {
              step: res[0].step,
              data: rawData || {},
              lastPromptTime: res[0].updatedAt ? new Date(res[0].updatedAt).getTime() : Date.now()
            };
            this.sessions.set(telegramUserId, loaded);
            return loaded;
          }
          this.sessions.delete(telegramUserId);
          return null;
        } catch (e) {
          console.warn("[TelegramBot.getSession] DB lookup warning:", e?.message);
          return this.sessions.get(telegramUserId) || null;
        }
      }
      async saveSession(telegramUserId, state) {
        this.sessions.set(telegramUserId, state);
        const sessionValues = {
          userId: telegramUserId,
          sessionType: "WIZARD",
          step: state.step,
          data: state.data,
          updatedAt: /* @__PURE__ */ new Date()
        };
        try {
          await db.insert(telegramBotSessions).values(sessionValues).onConflictDoUpdate({
            target: telegramBotSessions.userId,
            set: {
              sessionType: "WIZARD",
              step: state.step,
              data: state.data,
              updatedAt: /* @__PURE__ */ new Date()
            }
          });
        } catch (e) {
          console.warn("[TelegramBot.saveSession] DB save warning:", e?.message);
        }
        if (process.env.SQL_DB_NAME !== "cloud_sql_production_database") {
          try {
            await prodDb.insert(telegramBotSessions).values(sessionValues).onConflictDoUpdate({
              target: telegramBotSessions.userId,
              set: {
                sessionType: "WIZARD",
                step: state.step,
                data: state.data,
                updatedAt: /* @__PURE__ */ new Date()
              }
            });
          } catch (e) {
            console.warn("[TelegramBot.saveSession] prodDb save warning:", e?.message);
          }
        }
      }
      async deleteSession(telegramUserId) {
        this.sessions.delete(telegramUserId);
        try {
          await db.delete(telegramBotSessions).where(eq5(telegramBotSessions.userId, telegramUserId));
        } catch (e) {
          console.warn("[TelegramBot.deleteSession] DB delete warning:", e?.message);
        }
        if (process.env.SQL_DB_NAME !== "cloud_sql_production_database") {
          try {
            await prodDb.delete(telegramBotSessions).where(eq5(telegramBotSessions.userId, telegramUserId));
          } catch {
          }
        }
      }
      async clearAllSessions() {
        this.sessions.clear();
        this.editSessions.clear();
        this.m4DriverSessions.clear();
        this.referralSessions.clear();
        this.reactivationSessions.clear();
        this.recentDispatches = [];
        try {
          await db.delete(telegramBotSessions);
        } catch {
        }
        if (process.env.SQL_DB_NAME !== "cloud_sql_production_database") {
          try {
            await prodDb.delete(telegramBotSessions);
          } catch {
          }
        }
      }
      getStatus() {
        return {
          configured: !!this.token,
          polling: this.isPolling,
          botUsername: this.botInfo?.username || process.env.TELEGRAM_BOT_USERNAME || "KantineEntregasbot",
          activeSessions: this.sessions.size
        };
      }
      /**
       * Safe Telegram HTTP request helper
       * Never prints or leaks the token in logs or exceptions
       */
      async callTelegramApi(method, body, timeoutMs = 15e3) {
        if ((method === "sendMessage" || method === "editMessageText" || method === "editMessageReplyMarkup") && body?.chat_id) {
          this.recordRecentDispatch({
            method,
            chatId: body.chat_id,
            messageId: body.message_id,
            text: body.text || "",
            markup: body.reply_markup,
            timestamp: Date.now()
          });
        }
        if (body?.chat_id && isMockChatId(body.chat_id)) {
          const parsedMsgId = body.message_id ? typeof body.message_id === "number" ? body.message_id : parseInt(String(body.message_id), 10) : Math.floor(1e5 + Math.random() * 9e5);
          return {
            message_id: !isNaN(parsedMsgId) ? parsedMsgId : Math.floor(1e5 + Math.random() * 9e5),
            chat: { id: body.chat_id, type: "private" },
            date: Math.floor(Date.now() / 1e3),
            text: body.text || ""
          };
        }
        if (!this.token) {
          throw new Error("TELEGRAM_BOT_TOKEN_NOT_CONFIGURED");
        }
        const url = `https://api.telegram.org/bot${this.token}/${method}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: body ? JSON.stringify(body) : void 0,
            signal: controller.signal
          });
          const data = await response.json();
          if (!data.ok) {
            throw new Error(data.description || `Telegram API error: ${response.status}`);
          }
          return data.result;
        } catch (error) {
          if (error?.name === "AbortError") {
            throw new Error(`Telegram API request timed out after ${timeoutMs}ms`);
          }
          const sanitized = error?.message?.replace(/bot\d+:[A-Za-z0-9_-]+/g, "bot[REDACTED]") || "Telegram API error";
          throw new Error(sanitized);
        } finally {
          clearTimeout(timeoutId);
        }
      }
      async sendMessage(chatId, text2, extra = {}) {
        if (!this.token && !isMockChatId(chatId)) {
          console.warn(`[Telegram] Skipping message to chat ${chatId}: TELEGRAM_BOT_TOKEN is not configured.`);
          return false;
        }
        const parseMode = extra.parse_mode !== void 0 ? extra.parse_mode : "Markdown";
        try {
          await this.callTelegramApi("sendMessage", {
            chat_id: chatId,
            text: text2,
            ...extra,
            parse_mode: parseMode
          });
          return true;
        } catch (err) {
          if (err.message && err.message.includes("can't parse entities")) {
            try {
              const plainText = text2.replace(/<[^>]*>/g, "").replace(/[*_`]/g, "");
              const fallbackExtra = { ...extra };
              delete fallbackExtra.parse_mode;
              await this.callTelegramApi("sendMessage", {
                chat_id: chatId,
                text: plainText,
                ...fallbackExtra
              });
              return true;
            } catch (fallbackErr) {
              console.warn(`[Telegram] Fallback message failed for chat ${chatId}:`, fallbackErr.message);
            }
          }
          const isExpectedUnreachable = err.message?.includes("chat not found") || err.message?.includes("bot was blocked") || err.message?.includes("user is deactivated") || err.message?.includes("Forbidden");
          if (isExpectedUnreachable) {
            console.info(`[Telegram] Skipped message to chat ${chatId} (${err.message})`);
          } else {
            console.warn(`[Telegram] Failed to send message to chat ${chatId}:`, err.message);
          }
          return false;
        }
      }
      async editMessageReplyMarkup(chatId, messageId, extra = {}) {
        try {
          return await this.callTelegramApi("editMessageReplyMarkup", {
            chat_id: chatId,
            message_id: messageId,
            ...extra
          });
        } catch (err) {
          if (err.message && err.message.includes("message is not modified")) {
            return null;
          }
          throw err;
        }
      }
      /**
       * M2/M3: Send delivery offer to an ACTIVE driver
       * Enforces strict privacy: never sends full destination address, customer name or phone.
       * Includes inline button [✅ ACEITAR ENTREGA] for atomic acceptance in M3.
       */
      async sendDeliveryOffer(chatId, delivery) {
        if (!this.token) {
          return { success: false, errorCode: "TELEGRAM_BOT_TOKEN_NOT_CONFIGURED" };
        }
        const modeLabel = delivery.delivery_mode === "NO_CONTACT" ? "Sem contato" : "Presencial";
        const obsText = delivery.observations?.trim() ? delivery.observations.trim() : "Nenhuma";
        let feeStr = delivery.delivery_fee.trim();
        if (!feeStr.includes(",")) {
          const num = parseFloat(feeStr);
          if (!isNaN(num)) feeStr = num.toFixed(2).replace(".", ",");
        }
        const text2 = `\u{1F6F5} *NOVA ENTREGA #${delivery.id}*

\u{1F4CD} *Retirada:*
${delivery.pickup_location}

\u{1F3C1} *Destino:*
Bairro ${delivery.destination_neighborhood}

\u{1F4E6} *Carga:*
${delivery.cargo_description}

\u{1F4B0} *Frete:*
R$ ${feeStr}

\u{1F91D} *Modalidade:*
${modeLabel}

\u26A0\uFE0F *Observa\xE7\xE3o:*
${obsText}`;
        const replyMarkup = {
          inline_keyboard: [
            [
              {
                text: "\u2705 ACEITAR ENTREGA",
                callback_data: `accept_delivery:${delivery.id}`
              }
            ]
          ]
        };
        try {
          const result = await this.callTelegramApi("sendMessage", {
            chat_id: chatId,
            text: text2,
            parse_mode: "Markdown",
            reply_markup: replyMarkup
          });
          return {
            success: true,
            messageId: result?.message_id ? String(result.message_id) : void 0
          };
        } catch (err) {
          const isExpected = err.message?.includes("chat not found") || err.message?.includes("bot was blocked") || err.message?.includes("user is deactivated") || err.message?.includes("Forbidden");
          if (isExpected) {
            console.info(`[Telegram] Skipped dispatch offer #${delivery.id} to chat ${chatId} (${err.message})`);
          } else {
            console.warn(`[Telegram] Failed to dispatch offer #${delivery.id} to chat ${chatId}:`, err.message);
          }
          return { success: false, errorCode: err.message || "DISPATCH_FAILED" };
        }
      }
      /**
       * M3: Send confirmation to winning driver with full destination address revealed
       */
      async sendDeliveryAcceptedWon(chatId, delivery) {
        if (!this.token) return false;
        const modeLabel = delivery.delivery_mode === "NO_CONTACT" ? "Sem contato" : "Presencial";
        const obsText = delivery.observations?.trim() ? delivery.observations.trim() : "Nenhuma";
        let feeStr = delivery.delivery_fee.trim();
        if (!feeStr.includes(",")) {
          const num = parseFloat(feeStr);
          if (!isNaN(num)) feeStr = num.toFixed(2).replace(".", ",");
        }
        const text2 = `\u2705 *ENTREGA CONFIRMADA*

Entrega #${delivery.id} reservada para voc\xEA!

\u{1F4CD} *Endere\xE7o de Entrega:*
${delivery.destination_address}
Bairro: ${delivery.destination_neighborhood}

\u{1F4E6} *Carga:*
${delivery.cargo_description}

\u{1F4B0} *Frete:*
R$ ${feeStr}

\u{1F91D} *Modalidade:*
${modeLabel}

\u26A0\uFE0F *Observa\xE7\xE3o:*
${obsText}`;
        return this.sendMessage(chatId, text2);
      }
      /**
       * M3: Send notification to driver who attempted to accept an already taken delivery
       * Strictly preserves privacy: does NOT reveal winner's name, phone, or Telegram info
       */
      async sendDeliveryAlreadyAccepted(chatId) {
        if (!this.token) return false;
        return this.sendMessage(chatId, "\u274C Esta entrega j\xE1 foi aceita por outro motorista.");
      }
      /**
       * M3: Acknowledge Telegram callback query with optional notification toast/alert
       */
      async answerCallbackQuery(callbackQueryId, text2, showAlert = false) {
        if (!this.token || !callbackQueryId) return false;
        try {
          await this.callTelegramApi("answerCallbackQuery", {
            callback_query_id: callbackQueryId,
            text: text2,
            show_alert: showAlert
          });
          return true;
        } catch {
          return false;
        }
      }
      /**
       * M3: Invalidate or update offer button on other drivers' messages after delivery is accepted (UX improvement)
       */
      async invalidateOfferMarkup(chatId, messageId) {
        if (!this.token || !messageId) return false;
        try {
          await this.callTelegramApi("editMessageReplyMarkup", {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "\u{1F512} Entrega j\xE1 aceita",
                    callback_data: "noop_accepted"
                  }
                ]
              ]
            }
          });
          return true;
        } catch {
          return false;
        }
      }
      /**
       * M2: Send cancellation notification to drivers who received the offer
       */
      async sendDeliveryCancellation(chatId, deliveryId) {
        if (!this.token) return false;
        const text2 = `\u274C *ENTREGA #${deliveryId} CANCELADA*`;
        return this.sendMessage(chatId, text2);
      }
      // ==========================================
      // M2.1: Multi-Stop Routes Messaging
      // ==========================================
      /**
       * TG-ACCEPT: Build closed message text for losing drivers.
       * Keeps route history visible, clearly indicates closed/accepted status,
       * and preserves strict winner privacy (NO winner name, phone, telegram, pix, vehicle).
       */
      buildRouteOfferClosedText(route) {
        return buildRouteOfferClosedText(route);
      }
      /**
       * M2.1: Send route offer to eligible driver
       * Respects strict privacy before acceptance (Seção 26 & 27).
       */
      async sendRouteOffer(chatId, route, driverVehicle) {
        if (!this.token && !isMockChatId(chatId)) {
          return { success: false, errorCode: "TELEGRAM_BOT_TOKEN_NOT_CONFIGURED" };
        }
        const stopsCount = route.stops?.length || 1;
        const stopsHeader = stopsCount === 1 ? "1 ENTREGA" : `${stopsCount} ENTREGAS`;
        const numberEmojis = ["0\uFE0F\u20E3", "1\uFE0F\u20E3", "2\uFE0F\u20E3", "3\uFE0F\u20E3", "4\uFE0F\u20E3", "5\uFE0F\u20E3", "6\uFE0F\u20E3", "7\uFE0F\u20E3", "8\uFE0F\u20E3", "9\uFE0F\u20E3", "\u{1F51F}"];
        let stopsText = "";
        if (route.stops && route.stops.length > 0) {
          stopsText = route.stops.map((s, idx) => {
            const numEmoji = idx + 1 <= 10 ? numberEmojis[idx + 1] : `#${idx + 1}`;
            const deadlineLine = s.desired_deadline?.trim() ? `
\u23F1\uFE0F Desej\xE1vel: ${s.desired_deadline.trim()}` : "";
            return `${numEmoji} ${s.destination_neighborhood}${deadlineLine}`;
          }).join("\n\n");
        }
        const totalNum = parseFloat(String(route.total_fee || "0").replace(",", ".")) || 0;
        const storeRate = route.management_rate_snapshot != null && !isNaN(parseFloat(String(route.management_rate_snapshot))) ? parseFloat(String(route.management_rate_snapshot)) : 0.1;
        const driverFeeNum = Math.round(totalNum * (1 - storeRate) * 100) / 100;
        const driverFeeStr = driverFeeNum.toFixed(2).replace(".", ",");
        let totalFeeStr = route.total_fee.trim();
        if (!totalFeeStr.includes(",")) {
          const num = parseFloat(totalFeeStr);
          if (!isNaN(num)) totalFeeStr = num.toFixed(2).replace(".", ",");
        }
        const pickupNeighborhood = route.pickup_neighborhood_snapshot?.trim();
        const pickupNeighborhoodLine = pickupNeighborhood ? `
Bairro: ${pickupNeighborhood}` : "";
        const updatedVersionHeader = route.route_version && route.route_version > 1 ? `
\u{1F504} *OFERTA ATUALIZADA \u2014 v${route.route_version}*` : "";
        const isCarOnly = Array.isArray(route.accepted_vehicle_types) && route.accepted_vehicle_types.includes("CAR") && !route.accepted_vehicle_types.includes("MOTO") && !route.accepted_vehicle_types.includes("MOTO_WITH_BAG");
        const isMotoOnly = Array.isArray(route.accepted_vehicle_types) && !route.accepted_vehicle_types.includes("CAR");
        const routeVehicleIcon = isCarOnly ? "\u{1F697}" : isMotoOnly ? "\u{1F6F5}" : "\u{1F697}/\u{1F6F5}";
        const text2 = `${routeVehicleIcon} *NOVA CORRIDA #${route.id}*${updatedVersionHeader}
\u{1F194} *Corrida:* #${route.id}

\u{1F4CD} *RETIRADA:*
${route.pickup_name}${pickupNeighborhoodLine}

\u{1F4E6} *${stopsHeader}*

${stopsText}

\u{1F3C1} *ENCERRAMENTO M\xC1XIMO:*
${route.final_deadline}

\u{1F4B0} *FRETE:*
R$ ${driverFeeStr}

\u{1F697} *Compat\xEDvel com seu ve\xEDculo*`;
        const replyMarkup = {
          inline_keyboard: [
            [
              {
                text: `\u2705 ACEITAR CORRIDA #${route.id} (R$ ${driverFeeStr})`,
                callback_data: `accept_route:${route.id}:${route.route_version || 1}`
              }
            ]
          ]
        };
        try {
          const result = await this.callTelegramApi("sendMessage", {
            chat_id: chatId,
            text: text2,
            parse_mode: "Markdown",
            reply_markup: replyMarkup
          });
          return {
            success: true,
            messageId: result?.message_id ? String(result.message_id) : void 0
          };
        } catch (err) {
          const isExpected = err.message?.includes("chat not found") || err.message?.includes("bot was blocked") || err.message?.includes("user is deactivated") || err.message?.includes("Forbidden");
          if (isExpected) {
            console.info(`[Telegram] Skipped dispatch route offer #${route.id} to chat ${chatId} (${err.message})`);
          } else {
            console.warn(`[Telegram] Failed to dispatch route offer #${route.id} to chat ${chatId}:`, err.message);
          }
          return { success: false, errorCode: err.message || "DISPATCH_FAILED" };
        }
      }
      /**
       * M4 Seção 7 & M4.3 Seção 12: Send confirmation to winning driver with pickup details, navigation links and arrival action
       */
      async sendRouteAcceptedWon(chatId, route) {
        if (!this.token && !isMockChatId(chatId)) return false;
        const total = route.stops?.length || 0;
        const pickupNeighborhood = route.pickup_neighborhood_snapshot?.trim();
        const neighborhoodLine = pickupNeighborhood ? `
Bairro: ${pickupNeighborhood}` : "";
        const numberEmojis = ["0\uFE0F\u20E3", "1\uFE0F\u20E3", "2\uFE0F\u20E3", "3\uFE0F\u20E3", "4\uFE0F\u20E3", "5\uFE0F\u20E3", "6\uFE0F\u20E3", "7\uFE0F\u20E3", "8\uFE0F\u20E3", "9\uFE0F\u20E3", "\u{1F51F}"];
        let stopsSummary = "";
        if (route.stops && route.stops.length > 0) {
          const sortedStops = [...route.stops].sort((a, b) => a.sequence - b.sequence);
          stopsSummary = sortedStops.map((s, idx) => {
            const numEmoji = idx + 1 <= 10 ? numberEmojis[idx + 1] : `#${idx + 1}`;
            return `${numEmoji} ${s.destination_neighborhood || s.destination_address}`;
          }).join("\n");
        }
        const totalNum = parseFloat(String(route.total_fee || "0").replace(",", ".")) || 0;
        const storeRate = route.management_rate_snapshot != null && !isNaN(parseFloat(String(route.management_rate_snapshot))) ? parseFloat(String(route.management_rate_snapshot)) : 0.1;
        const driverFeeNum = Math.round(totalNum * (1 - storeRate) * 100) / 100;
        const driverFeeStr = driverFeeNum.toFixed(2).replace(".", ",");
        let totalFeeStr = (route.total_fee || "").trim();
        if (!totalFeeStr.includes(",")) {
          const num = parseFloat(totalFeeStr);
          if (!isNaN(num)) totalFeeStr = num.toFixed(2).replace(".", ",");
        }
        const navLinks = generateRouteNavigationLinks(route);
        let text2 = `\u2705 *CORRIDA #${route.id} ACEITA!*
\u{1F194} *Corrida:* #${route.id}

\u{1F4CD} *RETIRADA*
${route.pickup_name}
${route.pickup_address}${neighborhoodLine}

\u{1F4E6} *${total} ${total === 1 ? "ENTREGA" : "ENTREGAS"}*

` + (stopsSummary ? `${stopsSummary}

` : "") + (navLinks.maxStopsExceeded ? `\u2139\uFE0F Esta corrida possui v\xE1rias entregas. Utilize a navega\xE7\xE3o dispon\xEDvel em cada parada.

` : "") + `\u{1F4B0} *FRETE:*
R$ ${driverFeeStr}

\u{1F3C1} *Encerramento desejado:*
${route.final_deadline}`;
        const inlineKeyboard = [];
        if (navLinks.generalRouteUrl) {
          inlineKeyboard.push([
            {
              text: `\u{1F5FA}\uFE0F MAPS GERAL (Corrida #${route.id})`,
              url: navLinks.generalRouteUrl
            }
          ]);
        }
        if (navLinks.pickupUrl) {
          inlineKeyboard.push([
            {
              text: `\u{1F5FA}\uFE0F IR PARA COLETA (Corrida #${route.id})`,
              url: navLinks.pickupUrl
            }
          ]);
        }
        inlineKeyboard.push([
          {
            text: `\u{1F4E6} CHEGUEI PARA COLETA (Corrida #${route.id})`,
            callback_data: `route_arrived_pickup:${route.id}`
          }
        ]);
        return this.sendMessage(chatId, text2, {
          reply_markup: {
            inline_keyboard: inlineKeyboard
          }
        });
      }
      /**
       * M4 Seção 11 & M4.3 Seção 10: Apresentação da Parada ao Motorista com link individual Maps
       */
      async sendStopCard(chatId, route, stop) {
        const total = route.stops?.length || 1;
        const modeLabel = stop.delivery_mode === "NO_CONTACT" ? "SEM CONTATO" : "PRESENCIAL";
        const desiredDeadline = stop.desired_deadline ? stop.desired_deadline : "N\xE3o informado";
        const observations = stop.observations ? stop.observations : "Nenhuma";
        const text2 = `\u{1F194} *CORRIDA #${route.id}*
\u{1F4E6} *ENTREGA ${stop.sequence} DE ${total}*

\u{1F4CD} *Endere\xE7o:*
${stop.destination_address}

\u{1F3D8}\uFE0F *Bairro:*
${stop.destination_neighborhood}

\u{1F4E6} *Pedido:*
${stop.cargo_description}

\u23F1\uFE0F *Prazo desej\xE1vel:*
${desiredDeadline}

\u{1F91D} *Modalidade:*
${modeLabel}

\u26A0\uFE0F *Observa\xE7\xF5es:*
${observations}`;
        const buttons = [];
        if (stop.destination_address && stop.destination_address.trim().length > 0) {
          const stopMapsUrl = buildGoogleMapsDestinationUrl(stop.destination_address);
          if (stopMapsUrl) {
            buttons.push([
              {
                text: `\u{1F5FA}\uFE0F ABRIR NO MAPS (Corrida #${route.id})`,
                url: stopMapsUrl
              }
            ]);
          }
        } else {
          console.warn(`[Google Maps] Parada #${stop.id} sem endere\xE7o v\xE1lido para gerar navega\xE7\xE3o.`);
        }
        buttons.push([{ text: `\u{1F4E6} REALIZAR ENTREGA (Corrida #${route.id})`, callback_data: `stop_deliver:${stop.id}` }]);
        buttons.push([{ text: `\u26A0\uFE0F PROBLEMA NESTA ENTREGA (Corrida #${route.id})`, callback_data: `stop_incident:${stop.id}` }]);
        const pendingStops = (route.stops || []).filter((s) => s.status === "PENDING" && s.id !== stop.id);
        if (pendingStops.length > 0) {
          buttons.push([
            { text: `\u{1F504} OUTRAS PARADAS (Corrida #${route.id})`, callback_data: `route_choose_stop:${route.id}` }
          ]);
        }
        return this.sendMessage(chatId, text2, {
          reply_markup: {
            inline_keyboard: buttons
          }
        });
      }
      /**
       * M4 Seção 25: Resumo final para o motorista ao concluir a rota (substituído por mensagem amigável com chave PIX)
       * Se houver incidente reportado e a rota ainda não foi finalizada pelo atendente, não promete pagamento nem conclui.
       */
      async sendFinalRouteSummary(chatId, routeId) {
        const route = await this.routeService?.getRouteById(routeId);
        if (!route) return false;
        const hasAnyIncident = (route.stops || []).some(
          (s) => s.status === "INCIDENT" || !!s.incident_type
        );
        if (hasAnyIncident && route.status !== "COMPLETED") {
          return this.sendIncidentRouteNotification(chatId, routeId);
        }
        let driverPix = "chave cadastrada";
        if (route.accepted_driver_id && this.driverService) {
          const driver = await this.driverService.getDriverById(route.accepted_driver_id).catch(() => null);
          if (driver?.pix_key_value || driver?.pix_key) {
            driverPix = (driver.pix_key_value || driver.pix_key).trim();
          }
        }
        const text2 = `\u{1F194} *Corrida #${route.id}*

Entrega finalizada com sucesso!
Em breve seu pagamento ser\xE1 realizado no pix: ${driverPix}.

Qualquer d\xFAvida pode nos chamar no whatsapp 34 9 9678 7881

Muito Obrigado!
Kantine Gastronomia`;
        return this.sendMessage(chatId, text2);
      }
      /**
       * Mensagem para quando a corrida possui incidentes/pendências reportadas
       * Informa que a pendência será tratada via WhatsApp e que a Kantine fará os pagamentos devidos por PIX o mais breve possível
       */
      async sendIncidentRouteNotification(chatId, routeId) {
        const text2 = `\u26A0\uFE0F *Corrida #${routeId}*

Identificamos que houve uma pend\xEAncia/ocorr\xEAncia nesta entrega.

A pend\xEAncia ser\xE1 tratada com voc\xEA por WhatsApp e a Kantine vai efetuar os pagamentos devidos por PIX o mais breve poss\xEDvel.

Voc\xEA pode nos chamar a qualquer momento no WhatsApp:
\u{1F4F2} *34 9 9678 7881*

Muito Obrigado!
*Kantine Gastronomia*`;
        return this.sendMessage(chatId, text2);
      }
      /**
       * M2.1: Send cancellation notification to drivers who received the route offer
       */
      async sendRouteCancellation(chatId, routeId) {
        if (!this.token && !isMockChatId(chatId)) return false;
        const text2 = `\u274C *CORRIDA #${routeId} CANCELADA*`;
        return this.sendMessage(chatId, text2);
      }
      /**
       * M4.4 Seção 11: Notificação de Correção Operacional pós-aceite ao motorista vencedor
       */
      async sendRouteOperationalUpdate(chatId, route, oldVersion, newVersion, diffSummary) {
        if (!this.token && !isMockChatId(chatId)) return false;
        const navLinks = generateRouteNavigationLinks(route);
        const text2 = `\u26A0\uFE0F *CORRIDA #${route.id} ATUALIZADA*

A loja realizou uma corre\xE7\xE3o na sua Corrida #${route.id}.

*Vers\xE3o anterior:* ${oldVersion}
*Nova vers\xE3o:* ${newVersion}

${diffSummary}

Confira os dados antes de continuar.`;
        const inlineKeyboard = [];
        if (navLinks.generalRouteUrl) {
          inlineKeyboard.push([
            {
              text: `\u{1F5FA}\uFE0F MAPS ATUALIZADO (Corrida #${route.id})`,
              url: navLinks.generalRouteUrl
            }
          ]);
        } else if (navLinks.pickupUrl) {
          inlineKeyboard.push([
            {
              text: `\u{1F5FA}\uFE0F MAPS ATUALIZADO (Corrida #${route.id})`,
              url: navLinks.pickupUrl
            }
          ]);
        }
        inlineKeyboard.push([
          {
            text: `\u2705 CIENTE (Corrida #${route.id})`,
            callback_data: `route_ack:${route.id}:${newVersion}`
          }
        ]);
        return this.sendMessage(chatId, text2, {
          reply_markup: {
            inline_keyboard: inlineKeyboard
          }
        });
      }
      /**
       * M4.4 Seção 14: Notificação de Alteração Material pendente de aprovação do motorista vencedor
       */
      async sendRouteMaterialChangeProposal(chatId, route, updateId, diffSummary) {
        if (!this.token && !isMockChatId(chatId)) return false;
        const text2 = `\u26A0\uFE0F *CORRIDA #${route.id}: PROPOSTA DE ALTERA\xC7\xC3O*

A loja alterou as condi\xE7\xF5es da Corrida #${route.id} que voc\xEA aceitou.

${diffSummary}

Voc\xEA aceita as novas condi\xE7\xF5es desta corrida?`;
        const inlineKeyboard = [
          [
            {
              text: `\u2705 ACEITAR (Corrida #${route.id})`,
              callback_data: `route_mat_accept:${route.id}:${updateId}`
            },
            {
              text: `\u274C N\xC3O ACEITAR (Corrida #${route.id})`,
              callback_data: `route_mat_reject:${route.id}:${updateId}`
            }
          ]
        ];
        return this.sendMessage(chatId, text2, {
          reply_markup: {
            inline_keyboard: inlineKeyboard
          }
        });
      }
      /**
       * M4.4 Seção 14 & 15: Confirmação da decisão da alteração material
       */
      async sendRouteMaterialDecisionConfirmation(chatId, route, accepted) {
        if (!this.token && !isMockChatId(chatId)) return false;
        if (accepted) {
          const navLinks = generateRouteNavigationLinks(route);
          const text2 = `\u2705 *CORRIDA #${route.id}: ALTERA\xC7\xC3O APROVADA*

Voc\xEA aceitou as novas condi\xE7\xF5es da Corrida #${route.id} (v${route.route_version}).
As novas informa\xE7\xF5es j\xE1 est\xE3o em vigor no seu painel.`;
          const inlineKeyboard = [];
          if (navLinks.generalRouteUrl) {
            inlineKeyboard.push([
              {
                text: `\u{1F5FA}\uFE0F MAPS ATUALIZADO (Corrida #${route.id})`,
                url: navLinks.generalRouteUrl
              }
            ]);
          } else if (navLinks.pickupUrl) {
            inlineKeyboard.push([
              {
                text: `\u{1F5FA}\uFE0F MAPS ATUALIZADO (Corrida #${route.id})`,
                url: navLinks.pickupUrl
              }
            ]);
          }
          return this.sendMessage(chatId, text2, {
            reply_markup: inlineKeyboard.length > 0 ? { inline_keyboard: inlineKeyboard } : void 0
          });
        } else {
          const text2 = `\u274C *CORRIDA #${route.id}: ALTERA\xC7\xC3O RECUSADA*

Voc\xEA n\xE3o aceitou a altera\xE7\xE3o da Corrida #${route.id}.
As condi\xE7\xF5es anteriores da corrida continuam v\xE1lidas e vigentes.`;
          return this.sendMessage(chatId, text2);
        }
      }
      /**
       * TG-ACCEPT: Invalidate route offer for losing driver.
       * Primary: editMessageText to display closed message & remove inline keyboard completely.
       * Fallback: if editMessageText fails or messageId is not available:
       *   1. try editMessageReplyMarkup with empty keyboard ({ inline_keyboard: [] })
       *   2. send short message: "🔒 A Rota #X já foi aceita por outro motorista."
       */
      async invalidateRouteOffer(chatId, messageId, route) {
        if (!this.token && !isMockChatId(chatId)) {
          return { success: false, mode: "FAILED", error: "TELEGRAM_BOT_TOKEN_NOT_CONFIGURED" };
        }
        const numMessageId = messageId ? parseInt(String(messageId), 10) : null;
        const closedText = buildRouteOfferClosedText(route);
        if (numMessageId && !isNaN(numMessageId)) {
          try {
            await this.callTelegramApi("editMessageText", {
              chat_id: chatId,
              message_id: numMessageId,
              text: closedText,
              parse_mode: "Markdown",
              reply_markup: {
                inline_keyboard: []
              }
            });
            return { success: true, mode: "EDITED_TEXT" };
          } catch (primaryErr) {
            console.warn(
              `[TelegramBot] Primary editMessageText failed for route #${route.id} (chat ${chatId}, msg ${messageId}): ${primaryErr.message}. Executing fallback...`
            );
            try {
              await this.callTelegramApi("editMessageReplyMarkup", {
                chat_id: chatId,
                message_id: numMessageId,
                reply_markup: {
                  inline_keyboard: []
                }
              });
            } catch (markupErr) {
              console.warn(
                `[TelegramBot] Fallback editMessageReplyMarkup failed for route #${route.id} (chat ${chatId}): ${markupErr.message}`
              );
            }
            try {
              const fallbackText = `\u{1F512} A Rota #${route.id} j\xE1 foi aceita por outro motorista.`;
              await this.sendMessage(chatId, fallbackText);
              return { success: true, mode: "FALLBACK_SENT", error: primaryErr.message };
            } catch (fallbackErr) {
              console.error(
                `[TelegramBot] Fallback sendMessage failed for route #${route.id} (chat ${chatId}): ${fallbackErr.message}`
              );
              return { success: false, mode: "FAILED", error: fallbackErr.message };
            }
          }
        } else {
          try {
            const fallbackText = `\u{1F512} A Rota #${route.id} j\xE1 foi aceita por outro motorista.`;
            await this.sendMessage(chatId, fallbackText);
            return { success: true, mode: "FALLBACK_SENT_NO_MESSAGE_ID" };
          } catch (err) {
            console.error(
              `[TelegramBot] Fallback notification failed for route #${route.id} (chat ${chatId}, no message_id): ${err.message}`
            );
            return { success: false, mode: "FAILED", error: err.message };
          }
        }
      }
      /**
       * M4.4B: Invalidate previous route offer when a new version is published.
       * Modifies the previous card to show "ROTA #X — OFERTA ATUALIZADA (vOld -> vNew)"
       * and completely removes inline keyboard ({ inline_keyboard: [] }).
       * Fallback: if editMessageText fails, removes keyboard via editMessageReplyMarkup
       * and sends short fallback message.
       */
      async invalidateRouteOfferForVersion(chatId, messageId, routeId, oldVersion, newVersion) {
        if (!this.token && !isMockChatId(chatId)) {
          return { success: false, mode: "FAILED", error: "TELEGRAM_BOT_TOKEN_NOT_CONFIGURED" };
        }
        const numMessageId = messageId ? parseInt(String(messageId), 10) : null;
        const replacedText = buildRouteOfferReplacedText(routeId, oldVersion, newVersion);
        if (numMessageId && !isNaN(numMessageId)) {
          try {
            await this.callTelegramApi("editMessageText", {
              chat_id: chatId,
              message_id: numMessageId,
              text: replacedText,
              parse_mode: "Markdown",
              reply_markup: {
                inline_keyboard: []
              }
            });
            return { success: true, mode: "EDITED_TEXT" };
          } catch (primaryErr) {
            console.warn(
              `[TelegramBot] Primary editMessageText for replaced offer #${routeId} (v${oldVersion} -> v${newVersion}) failed for chat ${chatId}, msg ${messageId}: ${primaryErr.message}. Executing fallback...`
            );
            try {
              await this.callTelegramApi("editMessageReplyMarkup", {
                chat_id: chatId,
                message_id: numMessageId,
                reply_markup: {
                  inline_keyboard: []
                }
              });
            } catch (markupErr) {
              console.warn(
                `[TelegramBot] Fallback editMessageReplyMarkup failed for chat ${chatId}: ${markupErr.message}`
              );
            }
            try {
              const fallbackText = `\u{1F504} A Rota #${routeId} foi atualizada de v${oldVersion} para v${newVersion}. Verifique a nova oferta.`;
              await this.sendMessage(chatId, fallbackText);
              return { success: true, mode: "FALLBACK_SENT", error: primaryErr.message };
            } catch (fallbackErr) {
              console.error(
                `[TelegramBot] Fallback sendMessage failed for chat ${chatId}: ${fallbackErr.message}`
              );
              return { success: false, mode: "FAILED", error: fallbackErr.message };
            }
          }
        } else {
          try {
            const fallbackText = `\u{1F504} A Corrida #${routeId} foi atualizada de v${oldVersion} para v${newVersion}. Verifique a nova oferta.`;
            await this.sendMessage(chatId, fallbackText);
            return { success: true, mode: "FALLBACK_SENT_NO_MESSAGE_ID" };
          } catch (err) {
            console.error(
              `[TelegramBot] Fallback notification failed for chat ${chatId} (no message_id): ${err.message}`
            );
            return { success: false, mode: "FAILED", error: err.message };
          }
        }
      }
      /**
       * Helper: Lista corridas em andamento do motorista com acesso direto às ações de cada corrida
       */
      async sendDriverActiveRoutes(chatId, telegramUserId) {
        if (!this.driverService || !this.routeService) {
          await this.sendMessage(chatId, "Servi\xE7o temporariamente indispon\xEDvel.");
          return;
        }
        const driver = await this.driverService.getDriverByTelegramUserId(telegramUserId);
        if (!driver) {
          await this.sendMessage(chatId, "Motorista n\xE3o encontrado. Envie /start para iniciar seu cadastro.");
          return;
        }
        const allRoutes = await this.routeService.getRoutes();
        const activeRoutes = (allRoutes || []).filter(
          (r) => r.accepted_driver_id === driver.id && ["ACCEPTED", "ARRIVED_PICKUP", "PICKED_UP", "IN_TRANSIT"].includes(r.status)
        );
        if (activeRoutes.length === 0) {
          await this.sendMessage(
            chatId,
            "Voc\xEA n\xE3o possui nenhuma corrida em andamento no momento.\n\nQuando uma nova corrida for disponibilizada, voc\xEA receber\xE1 a notifica\xE7\xE3o aqui!"
          );
          return;
        }
        let text2 = `\u{1F4E6} *SUAS CORRIDAS EM ANDAMENTO (${activeRoutes.length}):*

`;
        const buttons = [];
        for (const r of activeRoutes) {
          let statusDesc = "Aceita (a caminho da coleta)";
          if (r.status === "ARRIVED_PICKUP") statusDesc = "Na coleta (aguardando pedidos)";
          if (r.status === "PICKED_UP") statusDesc = "Coletada (pronta para iniciar)";
          if (r.status === "IN_TRANSIT") statusDesc = "Em tr\xE2nsito / realizando entregas";
          const stopsCount = r.stops?.length || 1;
          const totalNum = parseFloat(String(r.total_fee || "0").replace(",", ".")) || 0;
          const storeRate = r.management_rate_snapshot != null && !isNaN(parseFloat(String(r.management_rate_snapshot))) ? parseFloat(String(r.management_rate_snapshot)) : 0.1;
          const driverFeeNum = Math.round(totalNum * (1 - storeRate) * 100) / 100;
          const driverFeeStr = driverFeeNum.toFixed(2).replace(".", ",");
          text2 += `\u{1F194} *Corrida #${r.id}*
\u2022 *Retirada:* ${r.pickup_name}
\u2022 *Status:* ${statusDesc}
\u2022 *Entregas:* ${stopsCount} ${stopsCount === 1 ? "parada" : "paradas"}
\u2022 *Frete:* R$ ${driverFeeStr}

`;
          buttons.push([
            {
              text: `\u{1F449} ABRIR CORRIDA #${r.id}`,
              callback_data: `open_active_route:${r.id}`
            }
          ]);
        }
        text2 += `Selecione a corrida desejada para visualizar o endere\xE7o e a\xE7\xF5es da entrega:`;
        await this.sendMessage(chatId, text2, {
          reply_markup: {
            inline_keyboard: buttons
          }
        });
      }
      /**
       * M2.1 & M3: Invalidate or update offer button on other drivers' messages after route is accepted.
       * Completely removes inline keyboard ({ inline_keyboard: [] }) so no actionable button remains.
       */
      async invalidateRouteOfferMarkup(chatId, messageId) {
        if (!this.token && !isMockChatId(chatId)) return false;
        if (!messageId) return false;
        const numMessageId = parseInt(String(messageId), 10);
        if (isNaN(numMessageId)) return false;
        try {
          await this.callTelegramApi("editMessageReplyMarkup", {
            chat_id: chatId,
            message_id: numMessageId,
            reply_markup: {
              inline_keyboard: []
            }
          });
          return true;
        } catch (err) {
          console.warn(`[TelegramBot.invalidateRouteOfferMarkup] Error for chat ${chatId}, msg ${messageId}:`, err.message);
          return false;
        }
      }
      async start() {
        if (!this.token) {
          console.log("[Telegram Bot] TELEGRAM_BOT_TOKEN not configured. Polling not started.");
          return;
        }
        if (this.isPolling) return;
        try {
          const me = await this.callTelegramApi("getMe");
          this.botInfo = me;
          console.log(`[Telegram Bot] Connected successfully as @${me.username} (${me.first_name})`);
        } catch (err) {
          console.error("[Telegram Bot] Could not connect to Telegram API:", err.message);
          return;
        }
        this.isPolling = true;
        this.shouldStop = false;
        this.pollLoop().catch((err) => {
          console.error("[Telegram Bot] Fatal polling loop error:", err.message);
          this.isPolling = false;
        });
      }
      stop() {
        this.shouldStop = true;
        this.isPolling = false;
      }
      async pollLoop() {
        console.log("[Telegram Bot] Starting long polling loop with leader election...");
        let consecutiveTransientErrors = 0;
        const ADVISORY_LOCK_ID = 987654321;
        let lockClient = null;
        let hasLock = false;
        while (!this.shouldStop && this.token) {
          if (!hasLock) {
            try {
              if (!lockClient) {
                lockClient = await createPool().connect();
                lockClient.on("error", (clientErr) => {
                  console.warn("[Telegram Bot] Advisory lock client socket terminated (recovering):", clientErr?.message || clientErr);
                  hasLock = false;
                  try {
                    lockClient?.release(true);
                  } catch {
                  }
                  lockClient = null;
                });
              }
              const lockRes = await lockClient.query("SELECT pg_try_advisory_lock($1) as locked", [ADVISORY_LOCK_ID]);
              if (lockRes.rows[0]?.locked) {
                hasLock = true;
                console.log("[Telegram Bot] Acquired leader lock via pg_advisory_lock. Active Telegram poller.");
              } else {
                await new Promise((r) => setTimeout(r, 5e3));
                continue;
              }
            } catch (lockErr) {
              console.warn("[Telegram Bot] Advisory lock error:", lockErr?.message);
              hasLock = false;
              if (lockClient) {
                try {
                  lockClient.release(true);
                } catch {
                }
                lockClient = null;
              }
              await new Promise((r) => setTimeout(r, 5e3));
              continue;
            }
          }
          try {
            const updates = await this.callTelegramApi(
              "getUpdates",
              {
                offset: this.offset,
                timeout: 10,
                allowed_updates: ["message", "callback_query"]
              },
              18e3
            );
            consecutiveTransientErrors = 0;
            if (Array.isArray(updates)) {
              for (const update of updates) {
                this.offset = Math.max(this.offset, update.update_id + 1);
                await this.handleUpdate(update).catch(
                  (e) => console.warn("[Telegram Bot] Error handling update:", e.message)
                );
              }
            }
          } catch (err) {
            if (this.shouldStop) break;
            const errMsg = err?.message || String(err);
            const isConflict = errMsg.includes("409") || errMsg.includes("Conflict");
            if (isConflict) {
              console.warn("[Telegram Bot] 409 Conflict: another worker active. Re-checking cluster lock in 5s...");
              hasLock = false;
              if (lockClient) {
                try {
                  await lockClient.query("SELECT pg_advisory_unlock($1)", [ADVISORY_LOCK_ID]);
                } catch {
                }
                try {
                  lockClient.release();
                } catch {
                }
                lockClient = null;
              }
              await new Promise((r) => setTimeout(r, 5e3));
              continue;
            }
            const isTransientNetwork = errMsg.includes("fetch failed") || errMsg.includes("timed out") || errMsg.includes("aborted") || errMsg.includes("ECONNRESET") || errMsg.includes("ETIMEDOUT") || errMsg.includes("EAI_AGAIN") || errMsg.includes("UND_ERR_");
            if (isTransientNetwork) {
              consecutiveTransientErrors++;
              const waitTimeMs = Math.min(1e3 * Math.pow(1.5, Math.min(consecutiveTransientErrors, 5)), 1e4);
              console.log(`[Telegram Bot] Polling connection cycle (${errMsg}). Reconnecting in ${Math.round(waitTimeMs / 1e3)}s...`);
              await new Promise((r) => setTimeout(r, waitTimeMs));
            } else if (errMsg.includes("401") || errMsg.includes("Unauthorized") || errMsg.includes("Not Found")) {
              console.warn("[Telegram Bot] Invalid or revoked bot token. Pausing polling until token update:", errMsg);
              this.isPolling = false;
              break;
            } else {
              console.warn("[Telegram Bot] Polling issue (retrying in 5s):", errMsg);
              await new Promise((r) => setTimeout(r, 5e3));
            }
          }
        }
        if (lockClient) {
          try {
            await lockClient.query("SELECT pg_advisory_unlock($1)", [ADVISORY_LOCK_ID]);
          } catch {
          }
          try {
            lockClient.release();
          } catch {
          }
          lockClient = null;
        }
        this.isPolling = false;
        console.log("[Telegram Bot] Polling stopped.");
      }
      /**
       * Helper to build inline keyboard for simplified vehicle types (supports multi-selection toggles)
       */
      getVehicleInlineKeyboard(selectedVehicles = []) {
        const isSelected = (v) => selectedVehicles.includes(v);
        const count = selectedVehicles.length;
        const keyboard = [
          [{ text: `${isSelected("CAR") ? "\u2705 " : "\u2B1C "}\u{1F697} Carro`, callback_data: "veh_toggle:CAR" }],
          [{ text: `${isSelected("MOTO") ? "\u2705 " : "\u2B1C "}\u{1F3CD}\uFE0F Moto`, callback_data: "veh_toggle:MOTO" }],
          [{ text: `${isSelected("MOTO_WITH_BAG") ? "\u2705 " : "\u2B1C "}\u{1F392} Moto com Bag`, callback_data: "veh_toggle:MOTO_WITH_BAG" }]
        ];
        const actionsRow = [];
        if (count < 3) {
          actionsRow.push({ text: "\u{1F31F} Todas as 3 op\xE7\xF5es", callback_data: "veh_all" });
        }
        if (count > 0) {
          actionsRow.push({ text: `\u27A1\uFE0F Concluir Sele\xE7\xE3o (${count})`, callback_data: "veh_done" });
        }
        if (actionsRow.length > 0) {
          keyboard.push(actionsRow);
        }
        return { inline_keyboard: keyboard };
      }
      getEditVehicleInlineKeyboard(selectedVehicles = []) {
        const isSelected = (v) => selectedVehicles.includes(v);
        const count = selectedVehicles.length;
        const keyboard = [
          [{ text: `${isSelected("CAR") ? "\u2705 " : "\u2B1C "}\u{1F697} Carro`, callback_data: "edit_veh_toggle:CAR" }],
          [{ text: `${isSelected("MOTO") ? "\u2705 " : "\u2B1C "}\u{1F3CD}\uFE0F Moto`, callback_data: "edit_veh_toggle:MOTO" }],
          [{ text: `${isSelected("MOTO_WITH_BAG") ? "\u2705 " : "\u2B1C "}\u{1F392} Moto com Bag`, callback_data: "edit_veh_toggle:MOTO_WITH_BAG" }]
        ];
        const actionsRow = [];
        if (count < 3) {
          actionsRow.push({ text: "\u{1F31F} Todas as 3", callback_data: "edit_veh_all" });
        }
        if (count > 0) {
          actionsRow.push({ text: `\u27A1\uFE0F Confirmar (${count})`, callback_data: "edit_veh_done" });
        }
        actionsRow.push({ text: "\u274C Cancelar", callback_data: "cancel_edit" });
        keyboard.push(actionsRow);
        return { inline_keyboard: keyboard };
      }
      /**
       * Handle incoming Telegram message or callback query
       */
      async handleUpdate(update) {
        if (update.callback_query) {
          await this.handleCallbackQuery(update.callback_query);
          return;
        }
        const message = update.message;
        if (!message || !message.from) return;
        const telegramUserId = message.from.id.toString();
        const chatId = message.chat.id.toString();
        let rawText = (message.text || "").trim();
        if (!rawText && message.contact && message.contact.phone_number) {
          rawText = message.contact.phone_number;
        }
        const isStart = rawText === "/start" || rawText.startsWith("/start ") || rawText.startsWith("/start=");
        if (isStart) {
          const payload = rawText.replace(/^\/start[= ]*/, "").trim();
          await this.handleStartCommand(telegramUserId, chatId, message.from, payload);
          return;
        }
        const lowerText = rawText.toLowerCase();
        if (lowerText === "/meuperfil" || lowerText === "/meucadastro" || lowerText === "/perfil" || lowerText === "meu perfil" || lowerText === "meu cadastro" || lowerText === "\u{1F464} meu cadastro") {
          this.editSessions.delete(telegramUserId);
          if (this.driverService) {
            const existing = await this.driverService.getDriverByTelegramUserId(telegramUserId);
            if (existing) {
              await this.sendMyProfile(chatId, telegramUserId);
              return;
            }
          }
        }
        if (lowerText === "/indicar" || lowerText === "/indicarmotorista" || lowerText === "indicar motorista" || lowerText === "\u{1F465} indicar motorista") {
          await this.startReferralFlow(telegramUserId, chatId);
          return;
        }
        if (lowerText === "/minhasindicacoes" || lowerText === "/indicacoes" || lowerText === "minhas indica\xE7\xF5es" || lowerText === "minhas indicacoes" || lowerText === "\u{1F4CB} minhas indica\xE7\xF5es" || lowerText === "\u{1F4CB} minhas indicacoes") {
          await this.showMyReferrals(telegramUserId, chatId);
          return;
        }
        if (lowerText === "/corridas" || lowerText === "/rotas" || lowerText === "/minhasrotas" || lowerText === "/minhascorridas" || lowerText === "minhas corridas" || lowerText === "minhas rotas" || lowerText === "\u{1F4E6} minhas corridas" || lowerText === "\u{1F4E6} minhas rotas") {
          await this.sendDriverActiveRoutes(chatId, telegramUserId);
          return;
        }
        const referralSession = this.referralSessions.get(telegramUserId);
        if (referralSession) {
          await this.processReferralInput(telegramUserId, chatId, rawText, referralSession);
          return;
        }
        const reactivationSession = this.reactivationSessions.get(telegramUserId);
        if (reactivationSession) {
          await this.processReactivationInput(telegramUserId, chatId, rawText, reactivationSession);
          return;
        }
        const editSession = this.editSessions.get(telegramUserId);
        if (editSession) {
          await this.processEditInput(telegramUserId, chatId, rawText, editSession);
          return;
        }
        const m4Session = this.m4DriverSessions.get(telegramUserId);
        if (m4Session) {
          await this.processM4Input(telegramUserId, chatId, message, m4Session);
          return;
        }
        const session = await this.getSession(telegramUserId);
        if (!session) {
          if (this.driverService) {
            const existing = await this.driverService.getDriverByTelegramUserId(telegramUserId);
            if (existing) {
              await this.sendMainMenu(chatId, existing);
              return;
            }
          }
          const digitsOnly = (rawText || "").replace(/\D/g, "");
          const hasLetters = /[a-zA-ZÀ-ÿ]{2,}/.test(rawText || "");
          if (rawText && rawText.length >= 2 && !rawText.startsWith("/") && hasLetters && digitsOnly.length < 6) {
            const newSession = {
              step: "PHONE",
              data: {
                name: rawText.trim(),
                invite_token: "convite_geral"
              },
              lastPromptTime: Date.now()
            };
            await this.saveSession(telegramUserId, newSession);
            await this.sendMessage(
              chatId,
              `\u{1F44B} Ol\xE1, *${escapeHtml(rawText.trim())}*! Bem-vindo \xE0 *Kantine Entregas*! \u{1F680}

Por favor, informe seu *telefone com DDD* (ex: 34999999999):`
            );
            return;
          }
          await this.sendMessage(
            chatId,
            "\u{1F44B} *Kantine Entregas*\n\nSeja bem-vindo \xE0 central de entregadores da Kantine!\n\nPara iniciar seu cadastro de motorista parceiro, clique no bot\xE3o abaixo:",
            {
              reply_markup: {
                inline_keyboard: [
                  [{ text: "\u{1F680} INICIAR MEU CADASTRO", callback_data: "start_cadastro" }]
                ]
              }
            }
          );
          return;
        }
        await this.processWizardInput(telegramUserId, chatId, rawText, session);
      }
      async handleStartCommand(telegramUserId, chatId, fromUser, payload) {
        await this.deleteSession(telegramUserId);
        this.editSessions.delete(telegramUserId);
        this.referralSessions.delete(telegramUserId);
        this.reactivationSessions.delete(telegramUserId);
        const cleanToken = (payload || "").replace(/^invite_/, "").trim();
        const isGenericCadastro = ["cadastro", "cadastrar", "registrar", "registro", "novo", "entregador", "convite", "geral", "start"].includes(
          cleanToken.toLowerCase()
        );
        if (this.driverService) {
          if (cleanToken && !isGenericCadastro) {
            const linkedDriver = await this.driverService.bindPendingDriverToTelegram(
              cleanToken,
              telegramUserId,
              chatId
            );
            if (linkedDriver) {
              await this.sendMessage(
                chatId,
                `\u2705 Ol\xE1, *${escapeHtml(linkedDriver.name)}*! Sua conta do Telegram foi vinculada ao seu cadastro com sucesso.`
              );
              await this.sendMainMenu(chatId, linkedDriver);
              return;
            }
          }
          const existing = await this.driverService.getDriverByTelegramUserId(telegramUserId);
          if (isGenericCadastro) {
            if (existing && existing.status === "ACTIVE") {
              await this.sendMessage(
                chatId,
                `\u{1F44B} Ol\xE1, *${escapeHtml(existing.name)}*! Voc\xEA j\xE1 possui cadastro *ATIVO* na Kantine Entregas! \u{1F680}

Caso queira visualizar ou editar seus dados, acesse *Meu Cadastro*.
Caso queira reiniciar seu cadastro do zero, clique abaixo:`,
                {
                  reply_markup: {
                    inline_keyboard: [
                      [{ text: "\u{1F464} MEU CADASTRO", callback_data: "menu_my_profile" }],
                      [{ text: "\u{1F504} REINICIAR CADASTRO DO ZERO", callback_data: "force_restart_cadastro" }]
                    ]
                  }
                }
              );
              return;
            }
            const genericSession = {
              step: "NAME",
              data: {
                invite_token: "convite_geral"
              },
              lastPromptTime: Date.now()
            };
            await this.saveSession(telegramUserId, genericSession);
            await this.sendMessage(
              chatId,
              `\u{1F44B} Ol\xE1! Seja bem-vindo \xE0 *Kantine Entregas*! \u{1F680}

Vamos dar in\xEDcio ao seu cadastro de motorista parceiro.

Para come\xE7ar, por favor informe seu *nome completo*:`
            );
            return;
          }
          if (!cleanToken) {
            if (existing) {
              await this.sendMainMenu(chatId, existing);
              return;
            }
            const genericSession = {
              step: "NAME",
              data: {
                invite_token: "convite_geral"
              },
              lastPromptTime: Date.now()
            };
            await this.saveSession(telegramUserId, genericSession);
            await this.sendMessage(
              chatId,
              `\u{1F44B} Ol\xE1! Seja bem-vindo \xE0 *Kantine Entregas*! \u{1F680}

Vamos dar in\xEDcio ao seu cadastro de motorista parceiro.

Para come\xE7ar, por favor informe seu *nome completo*:`
            );
            return;
          }
        }
        const refSvc = this.referralService || (await Promise.resolve().then(() => (init_referralService(), referralService_exports))).referralService;
        try {
          const validation = await refSvc.validateInviteToken(cleanToken);
          if (validation.valid && validation.referral) {
            const ref = validation.referral;
            if (validation.alreadyBoundUser && validation.alreadyBoundUser !== telegramUserId) {
              await this.sendMessage(
                chatId,
                "\u274C *Este convite j\xE1 foi utilizado por outro usu\xE1rio.*"
              );
              return;
            }
            try {
              await refSvc.consumeInvite(cleanToken, telegramUserId);
            } catch (consumeErr) {
              if (consumeErr.message?.includes("ANOTHER_USER")) {
                await this.sendMessage(
                  chatId,
                  "\u274C *Este convite j\xE1 foi utilizado por outro usu\xE1rio.*"
                );
                return;
              }
              await this.sendMessage(
                chatId,
                `\u274C ${consumeErr.message}`
              );
              return;
            }
            this.sessions.set(telegramUserId, {
              step: "NAME",
              data: {
                name: ref.referred_name || void 0,
                phone: ref.referred_phone || void 0,
                invite_token: cleanToken
              },
              lastPromptTime: Date.now()
            });
            await this.sendMessage(
              chatId,
              `\u{1F44B} Ol\xE1, *${escapeHtml(ref.referred_name)}*! Seu convite foi validado com sucesso. \u{1F680}

Para dar in\xEDcio ao seu cadastro na Kantine Delivery, por favor confirme seu *nome completo*:`
            );
            return;
          }
          if (validation.error === "TOKEN_EXPIRED") {
            await this.sendMessage(
              chatId,
              "\u274C *Este convite expirou.*\n\nPe\xE7a ao motorista que realizou sua indica\xE7\xE3o para solicitar uma nova autoriza\xE7\xE3o \xE0 Kantine."
            );
            return;
          }
        } catch (err) {
          console.warn("[TelegramBot] Validation of referral token failed:", err.message);
        }
        if (this.driverService?.getInviteByToken) {
          try {
            const legacyInvite = await this.driverService.getInviteByToken(cleanToken);
            if (legacyInvite && legacyInvite.status === "PENDING") {
              this.sessions.set(telegramUserId, {
                step: "NAME",
                data: {
                  name: legacyInvite.name || void 0,
                  phone: legacyInvite.phone || void 0,
                  invite_token: cleanToken
                },
                lastPromptTime: Date.now()
              });
              await this.sendMessage(
                chatId,
                `\u{1F44B} Ol\xE1, *${escapeHtml(legacyInvite.name || "Motorista")}*! Seu convite foi validado.

Por favor confirme seu *nome completo*:`
              );
              return;
            }
          } catch {
          }
        }
        await this.sendMessage(
          chatId,
          "\u274C *Convite inv\xE1lido ou n\xE3o encontrado.*\n\nVerifique se o link foi copiado corretamente ou inicie seu cadastro pelo convite oficial da Kantine Entregas."
        );
      }
      async sendMainMenu(chatId, driver) {
        const firstName = driver.name.split(" ")[0] || driver.name;
        const isExcluded = driver.status === "EXCLUDED" || driver.is_excluded;
        let statusLabel = "BLOQUEADO";
        if (driver.status === "ACTIVE") statusLabel = "ATIVO";
        else if (driver.status === "PENDING") statusLabel = "AGUARDANDO APROVA\xC7\xC3O";
        else if (isExcluded) statusLabel = "CADASTRO DESATIVADO / EXCLU\xCDDO";
        let msg = `<b>KANTINE ENTREGAS</b>

Ol\xE1, ${escapeHtml(firstName)}.

<b>Status:</b> ${escapeHtml(statusLabel)}`;
        const buttons = [];
        if (isExcluded) {
          const reason = driver.exclusion_reason || driver.previous_exclusion_reason || "Desativa\xE7\xE3o administrativa";
          msg += `
\u2022 <b>Motivo do desligamento:</b> ${escapeHtml(reason)}`;
          msg += `

\u26A0\uFE0F <b>Processo Reiniciado do Zero:</b>
Motoristas exclu\xEDdos t\xEAm o processo zerado. Para retornar \xE0 equipe Kantine Entregas, \xE9 necess\xE1rio refazer o cadastro completo com dados atualizados e passar por nova aprova\xE7\xE3o.

Clique no bot\xE3o abaixo para reiniciar seu cadastro agora:`;
          buttons.push([
            { text: "\u{1F680} REINICIAR CADASTRO DO ZERO", callback_data: "force_restart_cadastro" }
          ]);
          buttons.push([{ text: "\u{1F464} MEU CADASTRO", callback_data: "menu_my_profile" }]);
        } else if (driver.status === "BLOCKED") {
          if (driver.reactivation_requested) {
            msg += `

\u23F3 <b>Solicita\xE7\xE3o de reativa\xE7\xE3o em an\xE1lise pela equipe Kantine.</b>
Justificativa informada: <i>"${escapeHtml(driver.reactivation_reason || "")}"</i>`;
          } else {
            msg += `

Seu cadastro est\xE1 bloqueado no momento. Voc\xEA pode enviar uma solicita\xE7\xE3o de reativa\xE7\xE3o para an\xE1lise da administra\xE7\xE3o.`;
            buttons.push([{ text: "\u{1F504} SOLICITAR REATIVA\xC7\xC3O", callback_data: "req_reactivation" }]);
          }
          buttons.push([
            { text: "\u{1F464} MEU CADASTRO", callback_data: "menu_my_profile" },
            { text: "\u{1F4CB} MINHAS INDICA\xC7\xD5ES", callback_data: "menu_my_referrals" }
          ]);
        } else if (driver.status === "ACTIVE") {
          try {
            const allRoutes = await this.routeService?.getRoutes();
            const activeRoutes = (allRoutes || []).filter(
              (r) => r.accepted_driver_id === driver.id && ["ACCEPTED", "ARRIVED_PICKUP", "PICKED_UP", "IN_TRANSIT"].includes(r.status)
            );
            if (activeRoutes.length > 0) {
              buttons.push([
                { text: `\u{1F4E6} MINHAS CORRIDAS EM ANDAMENTO (${activeRoutes.length})`, callback_data: "menu_my_routes" }
              ]);
            }
          } catch {
          }
          buttons.push([
            { text: "\u{1F464} MEU CADASTRO", callback_data: "menu_my_profile" }
          ]);
          buttons.push([
            { text: "\u{1F465} INDICAR MOTORISTA", callback_data: "menu_refer_driver" },
            { text: "\u{1F4CB} MINHAS INDICA\xC7\xD5ES", callback_data: "menu_my_referrals" }
          ]);
        } else {
          buttons.push([
            { text: "\u{1F464} MEU CADASTRO", callback_data: "menu_my_profile" },
            { text: "\u{1F504} REINICIAR / ATUALIZAR", callback_data: "force_restart_cadastro" }
          ]);
          buttons.push([
            { text: "\u{1F4CB} MINHAS INDICA\xC7\xD5ES", callback_data: "menu_my_referrals" }
          ]);
        }
        await this.sendMessage(chatId, msg, {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: buttons
          }
        });
      }
      async processReactivationInput(telegramUserId, chatId, rawText, session) {
        if (rawText.toLowerCase() === "/cancelar" || rawText.toLowerCase() === "cancelar") {
          this.reactivationSessions.delete(telegramUserId);
          await this.sendMessage(chatId, "\u274C Solicita\xE7\xE3o cancelada.");
          if (this.driverService) {
            const driver = await this.driverService.getDriverById(session.driverId);
            if (driver) await this.sendMainMenu(chatId, driver);
          }
          return;
        }
        if (rawText.trim().length < 3) {
          await this.sendMessage(
            chatId,
            "\u26A0\uFE0F Por favor, informe uma justificativa com no m\xEDnimo 3 caracteres.\n\nOu envie /cancelar para desistir."
          );
          return;
        }
        this.reactivationSessions.delete(telegramUserId);
        try {
          if (session.type === "REACTIVATION") {
            const updated = await this.driverService.requestReactivation(session.driverId, rawText.trim());
            await this.sendMessage(
              chatId,
              "\u2705 *Solicita\xE7\xE3o de Reativa\xE7\xE3o Enviada!*\n\nSua justificativa foi registrada com sucesso e ser\xE1 analisada pelos administradores da Kantine.\nVoc\xEA receber\xE1 uma notifica\xE7\xE3o assim que for avaliada."
            );
            await this.sendMainMenu(chatId, updated);
          } else {
            const updated = await this.driverService.requestReinclusion(session.driverId, rawText.trim());
            await this.sendMessage(
              chatId,
              "\u2705 *Pedido de Reinclus\xE3o Enviado!*\n\nSua justificativa foi registrada com sucesso e encaminhada para a decis\xE3o da administra\xE7\xE3o da Kantine com todo o seu hist\xF3rico preservado.\nVoc\xEA ser\xE1 notificado assim que houver uma delibera\xE7\xE3o."
            );
            await this.sendMainMenu(chatId, updated);
          }
        } catch (err) {
          console.error("[processReactivationInput failed]", err);
          await this.sendMessage(
            chatId,
            "\u274C Ocorreu um erro ao registrar sua solicita\xE7\xE3o. Por favor, tente novamente enviando /start."
          );
        }
      }
      async sendMyProfile(chatId, telegramUserId) {
        if (!this.driverService) return;
        const driver = await this.driverService.getDriverByTelegramUserId(telegramUserId);
        if (!driver) {
          await this.sendMessage(chatId, "Cadastro n\xE3o encontrado.");
          return;
        }
        const vehicleFriendly = getVehicleTypeLabel(driver.vehicle_type);
        const pixTypeDisplay = driver.pix_key_type === "REQUIRES_UPDATE" ? "" : `${driver.pix_key_type} `;
        const pixMasked = maskPixKey(driver.pix_key_type, driver.pix_key_value || driver.pix_key);
        const msg = `\u{1F464} <b>MEU CADASTRO</b>

<b>Nome:</b> ${escapeHtml(driver.name)}
<b>Telefone:</b> ${escapeHtml(driver.phone)}
<b>Ve\xEDculo:</b> ${escapeHtml(vehicleFriendly)}
<b>Pix:</b> ${escapeHtml(pixTypeDisplay + pixMasked)}`;
        await this.sendMessage(chatId, msg, {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "\u270F\uFE0F ALTERAR NOME", callback_data: "edit_profile_name" }],
              [{ text: "\u{1F4F1} ALTERAR TELEFONE", callback_data: "edit_profile_phone" }],
              [{ text: "\u{1F697} ALTERAR VE\xCDCULO", callback_data: "edit_profile_vehicle" }],
              [{ text: "\u{1F4B3} ALTERAR PIX", callback_data: "edit_profile_pix" }],
              [{ text: "\u21A9\uFE0F VOLTAR", callback_data: "menu_start" }]
            ]
          }
        });
      }
      /**
       * M1.2: Start nomination flow for ACTIVE drivers
       */
      async startReferralFlow(telegramUserId, chatId) {
        if (!this.driverService) {
          await this.sendMessage(chatId, "Servi\xE7o temporariamente indispon\xEDvel.");
          return;
        }
        const driver = await this.driverService.getDriverByTelegramUserId(telegramUserId);
        if (!driver || driver.status !== "ACTIVE") {
          await this.sendMessage(
            chatId,
            "\u26A0\uFE0F *Apenas motoristas com cadastro ATIVO podem indicar novos motoristas.*"
          );
          return;
        }
        this.editSessions.delete(telegramUserId);
        this.sessions.delete(telegramUserId);
        this.referralSessions.set(telegramUserId, {
          indicatorDriverId: driver.id,
          step: "AWAITING_NAME",
          data: {}
        });
        const msg = `\u{1F465} *INDICA\xC7\xC3O DE MOTORISTA*

Como motorista ativo, voc\xEA pode indicar novos profissionais para a Kantine Delivery.

Digite o *nome completo* do indicado:`;
        await this.sendMessage(chatId, msg, {
          reply_markup: {
            inline_keyboard: [[{ text: "\u274C CANCELAR", callback_data: "cancel_referral" }]]
          }
        });
      }
      /**
       * M1.2: Process input during referral creation wizard
       */
      async processReferralInput(telegramUserId, chatId, rawText, session) {
        const normalized = rawText.toUpperCase().trim();
        if (normalized === "CANCELAR" || normalized === "/CANCEL") {
          this.referralSessions.delete(telegramUserId);
          await this.sendMessage(chatId, "\u274C Indica\xE7\xE3o cancelada.\nNenhum dado foi salvo.");
          const driver = await this.driverService?.getDriverById(session.indicatorDriverId);
          if (driver) await this.sendMainMenu(chatId, driver);
          return;
        }
        if (session.step === "AWAITING_NAME") {
          const name = rawText.trim();
          if (name.length < 2) {
            await this.sendMessage(
              chatId,
              "\u274C Nome inv\xE1lido. Por favor, digite o *nome completo* do indicado (m\xEDnimo 2 letras):",
              {
                reply_markup: {
                  inline_keyboard: [[{ text: "\u274C CANCELAR", callback_data: "cancel_referral" }]]
                }
              }
            );
            return;
          }
          session.data.referredName = name;
          session.step = "AWAITING_PHONE";
          await this.sendMessage(
            chatId,
            `\xD3timo! Agora digite o *telefone com DDD* de *${escapeHtml(name)}* (ex: 34999999999):`,
            {
              reply_markup: {
                inline_keyboard: [[{ text: "\u274C CANCELAR", callback_data: "cancel_referral" }]]
              }
            }
          );
          return;
        }
        if (session.step === "AWAITING_PHONE") {
          let canonicalPhone = "";
          try {
            const refSvc2 = this.referralService || (await Promise.resolve().then(() => (init_referralService(), referralService_exports))).referralService;
            canonicalPhone = refSvc2.normalizePhone(rawText);
          } catch {
            await this.sendMessage(
              chatId,
              "\u274C Telefone inv\xE1lido. Por favor, digite o telefone com DDD (ex: 34999999999):",
              {
                reply_markup: {
                  inline_keyboard: [[{ text: "\u274C CANCELAR", callback_data: "cancel_referral" }]]
                }
              }
            );
            return;
          }
          session.data.referredPhone = canonicalPhone;
          session.step = "AWAITING_CONFIRMATION";
          const refSvc = this.referralService || (await Promise.resolve().then(() => (init_referralService(), referralService_exports))).referralService;
          const formattedPhone = refSvc.formatPhoneDisplay(canonicalPhone);
          const confirmMsg = `\u{1F465} *NOVA INDICA\xC7\xC3O*

*Nome:*
${escapeHtml(session.data.referredName)}

*Telefone:*
${escapeHtml(formattedPhone)}

Confirma o envio da indica\xE7\xE3o para an\xE1lise da Kantine?`;
          await this.sendMessage(chatId, confirmMsg, {
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: [
                [{ text: "\u2705 CONFIRMAR INDICA\xC7\xC3O", callback_data: "confirm_referral" }],
                [{ text: "\u274C CANCELAR", callback_data: "cancel_referral" }]
              ]
            }
          });
          return;
        }
        if (session.step === "AWAITING_CONFIRMATION") {
          if (normalized === "CONFIRMAR" || normalized === "CONFIRMAR INDICA\xC7\xC3O") {
            await this.commitReferral(telegramUserId, chatId, session);
            return;
          }
          await this.sendMessage(chatId, "Utilize os bot\xF5es abaixo para confirmar ou cancelar a indica\xE7\xE3o:", {
            reply_markup: {
              inline_keyboard: [
                [{ text: "\u2705 CONFIRMAR INDICA\xC7\xC3O", callback_data: "confirm_referral" }],
                [{ text: "\u274C CANCELAR", callback_data: "cancel_referral" }]
              ]
            }
          });
        }
      }
      /**
       * M1.2: Commit the referral after indicator confirmation
       */
      async commitReferral(telegramUserId, chatId, session) {
        try {
          const driver = await this.driverService?.getDriverById(session.indicatorDriverId);
          if (!driver || driver.status !== "ACTIVE") {
            this.referralSessions.delete(telegramUserId);
            await this.sendMessage(
              chatId,
              "\u26A0\uFE0F *Apenas motoristas com cadastro ATIVO podem realizar indica\xE7\xF5es.*"
            );
            return;
          }
          const refSvc = this.referralService || (await Promise.resolve().then(() => (init_referralService(), referralService_exports))).referralService;
          await refSvc.createReferral(
            session.indicatorDriverId,
            session.data.referredName,
            session.data.referredPhone
          );
          this.referralSessions.delete(telegramUserId);
          const msg = `\u2705 *Indica\xE7\xE3o enviada para an\xE1lise.*

A Kantine precisa aprovar a indica\xE7\xE3o antes que o motorista indicado possa realizar o cadastro.

Voc\xEA poder\xE1 acompanhar o status em "Minhas Indica\xE7\xF5es".`;
          await this.sendMessage(chatId, msg, {
            reply_markup: {
              inline_keyboard: [
                [{ text: "\u{1F4CB} MINHAS INDICA\xC7\xD5ES", callback_data: "menu_my_referrals" }],
                [{ text: "\u21A9\uFE0F MENU PRINCIPAL", callback_data: "menu_start" }]
              ]
            }
          });
        } catch (err) {
          console.error("[Telegram Bot] Referral commit error:", err.message);
          this.referralSessions.delete(telegramUserId);
          await this.sendMessage(chatId, `Erro ao criar indica\xE7\xE3o: ${err.message}`);
        }
      }
      /**
       * M1.2: Display indicator driver's referrals
       */
      async showMyReferrals(telegramUserId, chatId) {
        if (!this.driverService) return;
        const driver = await this.driverService.getDriverByTelegramUserId(telegramUserId);
        if (!driver) {
          await this.sendMessage(chatId, "Cadastro n\xE3o encontrado.");
          return;
        }
        const refSvc = this.referralService || (await Promise.resolve().then(() => (init_referralService(), referralService_exports))).referralService;
        const list = await refSvc.getReferralsByDriverId(driver.id);
        if (list.length === 0) {
          const emptyMsg = `\u{1F4CB} *MINHAS INDICA\xC7\xD5ES*

Voc\xEA ainda n\xE3o realizou nenhuma indica\xE7\xE3o.

` + (driver.status === "ACTIVE" ? `Como motorista ativo, voc\xEA pode indicar novos parceiros pelo bot\xE3o *\u{1F465} INDICAR MOTORISTA*.` : `Quando seu cadastro estiver ativo, voc\xEA poder\xE1 indicar novos motoristas.`);
          const buttons2 = [];
          if (driver.status === "ACTIVE") {
            buttons2.push([{ text: "\u{1F465} INDICAR MOTORISTA", callback_data: "menu_refer_driver" }]);
          }
          buttons2.push([{ text: "\u21A9\uFE0F MENU PRINCIPAL", callback_data: "menu_start" }]);
          await this.sendMessage(chatId, emptyMsg, {
            reply_markup: { inline_keyboard: buttons2 }
          });
          return;
        }
        let text2 = `\u{1F4CB} *MINHAS INDICA\xC7\xD5ES*

`;
        for (const r of list) {
          text2 += `\u{1F465} *${escapeHtml(r.referred_name)}*
`;
          text2 += `Status: *${escapeHtml(r.friendly_status)}*
`;
          if (r.status === "APPROVED" && r.invitation_expires_at) {
            const expiresStr = new Date(r.invitation_expires_at).toLocaleDateString("pt-BR");
            text2 += `Convite v\xE1lido at\xE9: ${expiresStr}
`;
            if (r.invite_link) {
              text2 += `\u{1F517} Convite: \`${r.invite_link}\`
`;
            }
          }
          text2 += `
`;
        }
        const buttons = [];
        if (driver.status === "ACTIVE") {
          buttons.push([{ text: "\u{1F465} INDICAR NOVO MOTORISTA", callback_data: "menu_refer_driver" }]);
        }
        buttons.push([{ text: "\u21A9\uFE0F MENU PRINCIPAL", callback_data: "menu_start" }]);
        await this.sendMessage(chatId, text2.trim(), {
          reply_markup: { inline_keyboard: buttons }
        });
      }
      async processWizardInput(telegramUserId, chatId, text2, session) {
        const normalized = text2.toUpperCase();
        if (normalized === "CANCELAR" || normalized === "/CANCEL") {
          this.sessions.delete(telegramUserId);
          await this.sendMessage(
            chatId,
            "Cadastro cancelado.\nQuando quiser recome\xE7ar, envie /start.",
            { reply_markup: { remove_keyboard: true } }
          );
          return;
        }
        if (session.step === "NAME") {
          if (!text2 || text2.length < 2) {
            await this.sendMessage(chatId, "Por favor, informe um nome v\xE1lido (m\xEDnimo 2 letras):");
            return;
          }
          const digitsOnly = text2.replace(/\D/g, "");
          const hasLetters = /[a-zA-ZÀ-ÿ]{2,}/.test(text2);
          if (digitsOnly.length >= 6 || !hasLetters) {
            await this.sendMessage(
              chatId,
              "\u26A0\uFE0F Por favor, informe seu *nome completo* utilizando letras (ex: Marcos Silva):"
            );
            return;
          }
          session.data.name = text2.trim();
          session.step = "PHONE";
          await this.saveSession(telegramUserId, session);
          await this.sendMessage(chatId, "Informe seu *telefone com DDD* (ex: 34999999999):");
          return;
        }
        if (session.step === "PHONE") {
          const digits = text2.replace(/\D/g, "");
          const localDigits = digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;
          if (localDigits.length < 10 || localDigits.length > 11) {
            await this.sendMessage(
              chatId,
              "Telefone inv\xE1lido. Por favor, informe seu *telefone com DDD* (10 ou 11 d\xEDgitos, ex: 34999006476):"
            );
            return;
          }
          session.data.phone = normalizeGeneralPhone(localDigits);
          session.step = "VEHICLE";
          session.data.vehicle_types = session.data.vehicle_types || [];
          await this.saveSession(telegramUserId, session);
          await this.sendMessage(
            chatId,
            "Selecione o(s) *tipo(s) de ve\xEDculo*:\n_(Voc\xEA pode selecionar mais de uma op\xE7\xE3o ou todas as 3)_",
            {
              reply_markup: this.getVehicleInlineKeyboard(session.data.vehicle_types)
            }
          );
          return;
        }
        if (session.step === "VEHICLE") {
          const parsedList = parseDriverVehicleTypes(text2);
          if (parsedList.length === 0) {
            await this.sendMessage(
              chatId,
              "Selecione ou informe uma ou mais das op\xE7\xF5es abaixo (ex: Carro e Moto, ou Todas as 3):",
              {
                reply_markup: this.getVehicleInlineKeyboard(session.data.vehicle_types || [])
              }
            );
            return;
          }
          session.data.vehicle_types = parsedList;
          session.data.vehicle_type = parsedList.join(",");
          session.step = "PIX_TYPE";
          await this.saveSession(telegramUserId, session);
          await this.sendMessage(
            chatId,
            "Selecione o *tipo de chave Pix* para recebimento dos repasses:",
            {
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: "CPF", callback_data: "reg_pixtype:CPF" },
                    { text: "TELEFONE", callback_data: "reg_pixtype:PHONE" }
                  ],
                  [
                    { text: "E-MAIL", callback_data: "reg_pixtype:EMAIL" },
                    { text: "ALEAT\xD3RIA", callback_data: "reg_pixtype:RANDOM" }
                  ]
                ]
              }
            }
          );
          return;
        }
        if (session.step === "PIX_TYPE") {
          const upper = text2.toUpperCase();
          let selectedType = null;
          if (upper === "CPF") selectedType = "CPF";
          else if (upper === "TELEFONE" || upper === "PHONE") selectedType = "PHONE";
          else if (upper === "EMAIL" || upper === "E-MAIL") selectedType = "EMAIL";
          else if (upper === "ALEAT\xD3RIA" || upper === "ALEATORIA" || upper === "RANDOM") selectedType = "RANDOM";
          if (!selectedType) {
            if (text2.includes("@")) {
              selectedType = "EMAIL";
            } else if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text2.trim())) {
              selectedType = "RANDOM";
            } else {
              const numDigits = text2.replace(/\D/g, "").length;
              if (numDigits === 11) {
                const cpfVal = validateAndNormalizePix("CPF", text2);
                if (cpfVal.isValid) {
                  selectedType = "CPF";
                } else {
                  selectedType = "PHONE";
                }
              } else if (numDigits === 10 || numDigits === 12 || numDigits === 13) {
                selectedType = "PHONE";
              }
            }
            if (selectedType) {
              const valRes = validateAndNormalizePix(selectedType, text2);
              if (valRes.isValid) {
                session.data.pix_key_type = selectedType;
                session.data.pix_key_value = valRes.canonical;
                session.data.pix_key = valRes.canonical;
                session.step = "CONFIRM";
                await this.saveSession(telegramUserId, session);
                const vehicleFriendlyLabel = getVehicleTypeLabel(session.data.vehicle_type || "CAR");
                const maskedPix = maskPixKey(session.data.pix_key_type, session.data.pix_key_value);
                const summary = `<b>CADASTRO DE MOTORISTA</b>

<b>Nome:</b> ${escapeHtml(session.data.name || "")}
<b>Telefone:</b> ${escapeHtml(session.data.phone || "")}
<b>Ve\xEDculo:</b> ${escapeHtml(vehicleFriendlyLabel)}
<b>Tipo Pix:</b> ${escapeHtml(session.data.pix_key_type)}
<b>Chave Pix:</b> ${escapeHtml(maskedPix)}`;
                await this.sendMessage(chatId, summary, {
                  parse_mode: "HTML",
                  reply_markup: {
                    inline_keyboard: [
                      [
                        { text: "CONFIRMAR CADASTRO", callback_data: "confirm_reg" },
                        { text: "CANCELAR", callback_data: "cancel_reg" }
                      ]
                    ]
                  }
                });
                return;
              }
            }
          }
          if (!selectedType) {
            await this.sendMessage(chatId, "Selecione o *tipo de chave Pix*:", {
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: "CPF", callback_data: "reg_pixtype:CPF" },
                    { text: "TELEFONE", callback_data: "reg_pixtype:PHONE" }
                  ],
                  [
                    { text: "E-MAIL", callback_data: "reg_pixtype:EMAIL" },
                    { text: "ALEAT\xD3RIA", callback_data: "reg_pixtype:RANDOM" }
                  ]
                ]
              }
            });
            return;
          }
          session.data.pix_key_type = selectedType;
          session.step = "PIX_VALUE";
          await this.saveSession(telegramUserId, session);
          let promptMsg = "Informe sua chave Pix:";
          if (selectedType === "CPF") promptMsg = "Informe o *CPF* (11 d\xEDgitos, ex: 123.456.789-00) utilizado como chave Pix:";
          if (selectedType === "PHONE") promptMsg = "Informe o *telefone com DDD* utilizado como chave Pix (ex: 34999999999):";
          if (selectedType === "EMAIL") promptMsg = "Informe o *e-mail* utilizado como chave Pix:";
          if (selectedType === "RANDOM") promptMsg = "Informe a *chave aleat\xF3ria (UUID)* utilizada como chave Pix:";
          await this.sendMessage(chatId, promptMsg);
          return;
        }
        if (session.step === "PIX_VALUE" || session.step === "PIX") {
          const pType = session.data.pix_key_type || "CPF";
          const valRes = validateAndNormalizePix(pType, text2);
          if (!valRes.isValid) {
            await this.sendMessage(
              chatId,
              `\u274C ${valRes.error}

Por favor, informe novamente o valor correspondente:`
            );
            return;
          }
          session.data.pix_key_type = pType;
          session.data.pix_key_value = valRes.canonical;
          session.data.pix_key = valRes.canonical;
          session.step = "CONFIRM";
          await this.saveSession(telegramUserId, session);
          const vehicleFriendlyLabel = getVehicleTypeLabel(session.data.vehicle_type || "CAR");
          const maskedPix = maskPixKey(session.data.pix_key_type, session.data.pix_key_value);
          const summary = `<b>CADASTRO DE MOTORISTA</b>

<b>Nome:</b> ${escapeHtml(session.data.name || "")}
<b>Telefone:</b> ${escapeHtml(session.data.phone || "")}
<b>Ve\xEDculo:</b> ${escapeHtml(vehicleFriendlyLabel)}
<b>Tipo Pix:</b> ${escapeHtml(session.data.pix_key_type || "CPF")}
<b>Chave Pix:</b> ${escapeHtml(maskedPix)}`;
          await this.sendMessage(chatId, summary, {
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [
                  { text: "CONFIRMAR CADASTRO", callback_data: "confirm_reg" },
                  { text: "CANCELAR", callback_data: "cancel_reg" }
                ]
              ]
            }
          });
          return;
        }
        if (session.step === "CONFIRM") {
          const norm = (text2 || "").trim().toUpperCase();
          if (norm === "CONFIRMAR CADASTRO" || norm === "CONFIRMAR" || norm === "SIM" || norm === "OK") {
            await this.commitRegistration(telegramUserId, chatId, session);
            return;
          }
          if (norm === "CANCELAR" || norm === "N\xC3O" || norm === "NAO") {
            await this.deleteSession(telegramUserId);
            await this.sendMessage(chatId, "Cadastro cancelado.\nQuando quiser recome\xE7ar, envie /start.");
            return;
          }
          await this.sendMessage(chatId, "Utilize o bot\xE3o *CONFIRMAR CADASTRO* abaixo para finalizar ou envie CANCELAR:", {
            reply_markup: {
              inline_keyboard: [
                [
                  { text: "CONFIRMAR CADASTRO", callback_data: "confirm_reg" },
                  { text: "CANCELAR", callback_data: "cancel_reg" }
                ]
              ]
            }
          });
        }
      }
      async processEditInput(telegramUserId, chatId, text2, editSession) {
        const normalized = text2.toUpperCase();
        if (normalized === "CANCELAR" || normalized === "/CANCEL") {
          this.editSessions.delete(telegramUserId);
          await this.sendMessage(chatId, "Altera\xE7\xE3o cancelada.");
          await this.sendMyProfile(chatId, telegramUserId);
          return;
        }
        const driver = await this.driverService.getDriverById(editSession.driverId);
        if (!driver) {
          this.editSessions.delete(telegramUserId);
          await this.sendMessage(chatId, "Erro: motorista n\xE3o encontrado.");
          return;
        }
        if (editSession.field === "NAME") {
          if (!text2 || text2.trim().length < 2) {
            await this.sendMessage(chatId, "Por favor, informe um nome v\xE1lido (m\xEDnimo 2 letras):");
            return;
          }
          editSession.pendingData.name = text2.trim();
          editSession.field = "CONFIRM";
          const msg = `<b>CONFIRMAR ALTERA\xC7\xC3O DE NOME</b>

<b>Nome atual:</b> ${escapeHtml(driver.name)}
<b>Novo nome:</b> ${escapeHtml(editSession.pendingData.name)}`;
          await this.sendMessage(chatId, msg, {
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [
                  { text: "\u2705 CONFIRMAR", callback_data: "confirm_edit" },
                  { text: "\u274C CANCELAR", callback_data: "cancel_edit" }
                ]
              ]
            }
          });
          return;
        }
        if (editSession.field === "PHONE") {
          const cleaned = text2.replace(/\D/g, "");
          if (cleaned.length < 8) {
            await this.sendMessage(
              chatId,
              "Telefone inv\xE1lido. Por favor, informe seu telefone com DDD:"
            );
            return;
          }
          editSession.pendingData.phone = normalizeGeneralPhone(text2);
          editSession.field = "CONFIRM";
          const msg = `<b>CONFIRMAR ALTERA\xC7\xC3O DE TELEFONE</b>

<b>Telefone atual:</b> ${escapeHtml(driver.phone)}
<b>Novo telefone:</b> ${escapeHtml(editSession.pendingData.phone)}`;
          await this.sendMessage(chatId, msg, {
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [
                  { text: "\u2705 CONFIRMAR", callback_data: "confirm_edit" },
                  { text: "\u274C CANCELAR", callback_data: "cancel_edit" }
                ]
              ]
            }
          });
          return;
        }
        if (editSession.field === "PIX_VALUE") {
          const valRes = validateAndNormalizePix(editSession.pendingData.pix_key_type, text2);
          if (!valRes.isValid) {
            await this.sendMessage(
              chatId,
              `\u274C ${valRes.error}

Por favor, informe novamente o valor da sua chave Pix:`
            );
            return;
          }
          editSession.pendingData.pix_key_value = valRes.canonical;
          editSession.field = "CONFIRM";
          const oldMasked = maskPixKey(driver.pix_key_type, driver.pix_key_value || driver.pix_key);
          const newMasked = maskPixKey(editSession.pendingData.pix_key_type, valRes.canonical);
          const msg = `<b>CONFIRMAR ALTERA\xC7\xC3O DE CHAVE PIX</b>

<b>Tipo atual:</b> ${escapeHtml(driver.pix_key_type)}
<b>Pix atual:</b> ${escapeHtml(oldMasked)}

<b>Novo tipo:</b> ${escapeHtml(editSession.pendingData.pix_key_type)}
<b>Nova chave:</b> ${escapeHtml(newMasked)}`;
          await this.sendMessage(chatId, msg, {
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [
                  { text: "\u2705 CONFIRMAR ALTERA\xC7\xC3O", callback_data: "confirm_edit" },
                  { text: "\u274C CANCELAR", callback_data: "cancel_edit" }
                ]
              ]
            }
          });
          return;
        }
        if (editSession.field === "CONFIRM") {
          if (normalized === "CONFIRMAR" || normalized === "CONFIRMAR ALTERA\xC7\xC3O") {
            await this.executeProfileEdit(telegramUserId, chatId, editSession);
            return;
          }
          await this.sendMessage(chatId, "Utilize os bot\xF5es abaixo para confirmar ou cancelar.", {
            reply_markup: {
              inline_keyboard: [
                [
                  { text: "\u2705 CONFIRMAR", callback_data: "confirm_edit" },
                  { text: "\u274C CANCELAR", callback_data: "cancel_edit" }
                ]
              ]
            }
          });
        }
      }
      async executeProfileEdit(telegramUserId, chatId, editSession) {
        if (!this.driverService) return;
        try {
          const payload = {};
          if (editSession.pendingData.name) {
            payload.name = editSession.pendingData.name;
          }
          if (editSession.pendingData.phone) {
            payload.phone = editSession.pendingData.phone;
          }
          if (editSession.pendingData.vehicle_type) {
            payload.vehicle_type = editSession.pendingData.vehicle_type;
          }
          if (editSession.pendingData.pix_key_type && editSession.pendingData.pix_key_value) {
            payload.pix = {
              pix_key_type: editSession.pendingData.pix_key_type,
              pix_key_value: editSession.pendingData.pix_key_value
            };
          }
          await this.driverService.updateDriverProfile(editSession.driverId, payload, {
            actor_type: "DRIVER",
            actor_id: telegramUserId
          });
          this.editSessions.delete(telegramUserId);
          await this.sendMessage(chatId, "\u2705 Dados cadastrais atualizados com sucesso!");
          await this.sendMyProfile(chatId, telegramUserId);
        } catch (err) {
          this.editSessions.delete(telegramUserId);
          console.error("[executeProfileEdit failed]", err.message);
          await this.sendMessage(chatId, `Erro ao atualizar cadastro: ${err.message}`);
          await this.sendMyProfile(chatId, telegramUserId);
        }
      }
      /**
       * Process interactive inputs during M4 route execution: PIN, Photo evidence, Incident note
       */
      async processM4Input(telegramUserId, chatId, message, session) {
        if (!this.routeService) return;
        if (session.mode === "AWAITING_PIN") {
          const pin = (message.text || "").trim();
          if (!pin) {
            await this.sendMessage(chatId, `\u{1F194} *Corrida #${session.routeId}*

Informe o PIN de entrega fornecido pelo cliente:`);
            return;
          }
          try {
            const result = await this.routeService.deliverStopWithPin(session.stopId, pin, { telegramUserId });
            if (!result.success) {
              await this.sendMessage(chatId, result.message);
              return;
            }
            this.m4DriverSessions.delete(telegramUserId);
            const route = await this.routeService.getRouteById(session.routeId);
            const totalStops = route?.stops?.length || 1;
            if (result.routeCompleted) {
              await this.sendMessage(
                chatId,
                `\u2705 *Corrida #${session.routeId}*: Entrega realizada com sucesso!`
              );
              await this.sendFinalRouteSummary(chatId, session.routeId);
            } else if (result.remainingCount === 0 && (result.hasIncident || result.hasUnresolvedIncident)) {
              await this.sendMessage(
                chatId,
                `\u2705 *Corrida #${session.routeId}*: Entrega ${result.stop?.sequence || 1} de ${totalStops} confirmada com sucesso!`
              );
              await this.sendIncidentRouteNotification(chatId, session.routeId);
            } else {
              await this.sendMessage(
                chatId,
                `\u2705 *Corrida #${session.routeId}*: Entrega ${result.stop?.sequence || 1} de ${totalStops} confirmada com sucesso!`
              );
              if (result.nextStop && route) {
                await this.sendStopCard(chatId, route, result.nextStop);
              }
            }
          } catch (err) {
            await this.sendMessage(chatId, `\u26A0\uFE0F *Corrida #${session.routeId}*: Erro: ${err.message}`);
          }
          return;
        }
        if (session.mode === "AWAITING_PHOTO") {
          if (!message.photo || !Array.isArray(message.photo) || message.photo.length === 0) {
            await this.sendMessage(chatId, `\u{1F194} *Corrida #${session.routeId}*

\u{1F4F7} Envie uma foto mostrando onde o pedido da entrega foi deixado.`);
            return;
          }
          const photo = message.photo[message.photo.length - 1];
          const fileId = photo.file_id;
          try {
            const result = await this.routeService.deliverStopWithPhoto(session.stopId, fileId, { telegramUserId });
            this.m4DriverSessions.delete(telegramUserId);
            const route = await this.routeService.getRouteById(session.routeId);
            const totalStops = route?.stops?.length || 1;
            if (result.routeCompleted) {
              await this.sendMessage(
                chatId,
                `\u2705 *Corrida #${session.routeId}*: Entrega realizada com sucesso!`
              );
              await this.sendFinalRouteSummary(chatId, session.routeId);
            } else if (result.remainingCount === 0 && (result.hasIncident || result.hasUnresolvedIncident)) {
              await this.sendMessage(
                chatId,
                `\u2705 *Corrida #${session.routeId}*: Entrega ${result.stop?.sequence || 1} de ${totalStops} confirmada com sucesso!`
              );
              await this.sendIncidentRouteNotification(chatId, session.routeId);
            } else {
              await this.sendMessage(
                chatId,
                `\u2705 *Corrida #${session.routeId}*: Entrega ${result.stop?.sequence || 1} de ${totalStops} confirmada com sucesso!`
              );
              if (result.nextStop && route) {
                await this.sendStopCard(chatId, route, result.nextStop);
              }
            }
          } catch (err) {
            await this.sendMessage(chatId, `\u26A0\uFE0F *Corrida #${session.routeId}*: ${err.message}`);
          }
          return;
        }
        if (session.mode === "AWAITING_INCIDENT_NOTE") {
          const note = (message.text || "").trim();
          if (!note) {
            await this.sendMessage(chatId, `\u{1F194} *Corrida #${session.routeId}*

Descreva brevemente o motivo do problema nesta entrega:`);
            return;
          }
          try {
            const result = await this.routeService.reportStopIncident(
              session.stopId,
              { incident_type: "OUTRO", incident_note: note },
              { telegramUserId }
            );
            this.m4DriverSessions.delete(telegramUserId);
            const route = await this.routeService.getRouteById(session.routeId);
            await this.sendMessage(
              chatId,
              `\u26A0\uFE0F *Corrida #${session.routeId}*: Incidente registrado para a Parada #${result.stop.sequence}: Outro (${note})

Restam: ${result.remainingCount} entregas pendentes nesta corrida.`
            );
            if (result.remainingCount === 0) {
              await this.sendIncidentRouteNotification(chatId, session.routeId);
            } else if (result.nextStop && route) {
              await this.sendStopCard(chatId, route, result.nextStop);
            }
          } catch (err) {
            await this.sendMessage(chatId, `\u26A0\uFE0F *Corrida #${session.routeId}*: Erro ao registrar incidente: ${err.message}`);
          }
          return;
        }
      }
      async handleCallbackQuery(query) {
        const data = query.data;
        const telegramUserId = query.from?.id?.toString();
        const chatId = query.message?.chat?.id?.toString() || telegramUserId;
        try {
          await this.callTelegramApi("answerCallbackQuery", {
            callback_query_id: query.id
          });
        } catch (e) {
        }
        if (!telegramUserId) return;
        if (data && data.startsWith("accept_route:")) {
          const parts = data.replace("accept_route:", "").trim().split(":");
          const routeId = parseInt(parts[0], 10);
          const expectedVersion = parts[1] ? parseInt(parts[1], 10) : void 0;
          if (isNaN(routeId)) {
            await this.answerCallbackQuery(query.id, "Dados inv\xE1lidos.", true);
            return;
          }
          if (!this.routeService) {
            await this.answerCallbackQuery(query.id, "Servi\xE7o indispon\xEDvel no momento.", true);
            return;
          }
          try {
            const result = await this.routeService.acceptRoute(routeId, {
              telegramUserId,
              expectedVersion
            });
            if (result.status === "WON") {
              await this.answerCallbackQuery(query.id, `\u2705 Corrida #${routeId} aceita por voc\xEA!`);
              if (result.route) {
                await this.sendRouteAcceptedWon(chatId, result.route);
              }
            } else if (result.status === "ALREADY_WON") {
              await this.answerCallbackQuery(query.id, `Corrida #${routeId} j\xE1 confirmada para voc\xEA.`);
              await this.sendMessage(chatId, `Corrida #${routeId}: Esta corrida j\xE1 est\xE1 confirmada para voc\xEA.`);
            } else if (result.status === "LOST") {
              await this.answerCallbackQuery(query.id, `\u274C Corrida #${routeId} j\xE1 foi aceita por outro motorista.`, true);
              await this.sendMessage(chatId, `\u274C Corrida #${routeId} j\xE1 foi aceita por outro motorista.`);
              if (query.message?.message_id) {
                const currentRoute = await this.routeService.getRouteById(routeId);
                if (currentRoute) {
                  await this.invalidateRouteOffer(chatId, query.message.message_id, currentRoute).catch(() => {
                  });
                } else {
                  await this.invalidateRouteOfferMarkup(chatId, query.message.message_id).catch(() => {
                  });
                }
              }
            } else {
              await this.answerCallbackQuery(query.id, result.message, true);
              await this.sendMessage(chatId, `Corrida #${routeId}: ${result.message}`);
              if ((result.error === "OUTDATED_ROUTE_VERSION" || result.error === "STALE_ROUTE_VERSION") && query.message?.message_id) {
                const currentRoute = await this.routeService.getRouteById(routeId);
                if (currentRoute) {
                  await this.invalidateRouteOfferForVersion(
                    chatId,
                    query.message.message_id,
                    routeId,
                    expectedVersion || 1,
                    currentRoute.route_version
                  ).catch(() => {
                  });
                } else {
                  await this.invalidateRouteOfferMarkup(chatId, query.message.message_id).catch(() => {
                  });
                }
              }
            }
          } catch (err) {
            await this.answerCallbackQuery(query.id, "Erro ao processar aceite da rota.", true);
          }
          return;
        }
        if (data && data.startsWith("route_ack:")) {
          const parts = data.replace("route_ack:", "").trim().split(":");
          const routeId = parseInt(parts[0], 10);
          const version = parseInt(parts[1], 10);
          if (!isNaN(routeId) && !isNaN(version) && this.driverService) {
            const driver = await this.driverService.getDriverByTelegramUserId(telegramUserId);
            if (driver) {
              await routeEditService.handleDriverOperationalAck(routeId, version, driver.id);
              await this.answerCallbackQuery(query.id, "\u2705 Ci\xEAncia confirmada!");
              await this.sendMessage(chatId, `\u2705 Voc\xEA confirmou ci\xEAncia da atualiza\xE7\xE3o da Corrida #${routeId} (v${version}).`);
            }
          }
          return;
        }
        if (data && data.startsWith("route_mat_accept:")) {
          const parts = data.replace("route_mat_accept:", "").trim().split(":");
          const routeId = parseInt(parts[0], 10);
          const updateId = parseInt(parts[1], 10);
          if (!isNaN(routeId) && !isNaN(updateId) && this.driverService) {
            const driver = await this.driverService.getDriverByTelegramUserId(telegramUserId);
            if (driver) {
              try {
                await routeEditService.handleDriverMaterialDecision(routeId, updateId, driver.id, "ACCEPT");
                await this.answerCallbackQuery(query.id, "\u2705 Altera\xE7\xE3o aceita com sucesso!");
              } catch (err) {
                await this.answerCallbackQuery(query.id, `\u26A0\uFE0F ${err.message}`, true);
              }
            }
          }
          return;
        }
        if (data && data.startsWith("route_mat_reject:")) {
          const parts = data.replace("route_mat_reject:", "").trim().split(":");
          const routeId = parseInt(parts[0], 10);
          const updateId = parseInt(parts[1], 10);
          if (!isNaN(routeId) && !isNaN(updateId) && this.driverService) {
            const driver = await this.driverService.getDriverByTelegramUserId(telegramUserId);
            if (driver) {
              try {
                await routeEditService.handleDriverMaterialDecision(routeId, updateId, driver.id, "REJECT");
                await this.answerCallbackQuery(query.id, "\u274C Altera\xE7\xE3o recusada.");
              } catch (err) {
                await this.answerCallbackQuery(query.id, `\u26A0\uFE0F ${err.message}`, true);
              }
            }
          }
          return;
        }
        if (data === "noop_route_accepted") {
          await this.answerCallbackQuery(query.id, "\u274C Esta rota j\xE1 foi aceita por outro motorista.", true);
          return;
        }
        if (data && data.startsWith("route_arrived_pickup:")) {
          const routeId = parseInt(data.replace("route_arrived_pickup:", "").trim(), 10);
          if (isNaN(routeId) || !this.routeService) {
            await this.answerCallbackQuery(query.id, "Dados inv\xE1lidos.", true);
            return;
          }
          try {
            await this.routeService.markArrivedPickup(routeId, { telegramUserId });
            await this.answerCallbackQuery(query.id, `\u{1F4CD} Corrida #${routeId}: Chegada registrada!`);
            const text2 = `\u{1F4CD} *Corrida #${routeId}: Chegada na Coleta Registrada!*

Quando estiver com os pedidos carregados, clique no bot\xE3o abaixo:`;
            await this.sendMessage(chatId, text2, {
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: `\u{1F4E6} PEDIDOS COLETADOS (Corrida #${routeId})`,
                      callback_data: `route_picked_up:${routeId}`
                    }
                  ]
                ]
              }
            });
          } catch (err) {
            await this.answerCallbackQuery(query.id, `Erro: ${err.message}`, true);
          }
          return;
        }
        if (data && data.startsWith("route_picked_up:")) {
          const routeId = parseInt(data.replace("route_picked_up:", "").trim(), 10);
          if (isNaN(routeId) || !this.routeService) {
            await this.answerCallbackQuery(query.id, "Dados inv\xE1lidos.", true);
            return;
          }
          try {
            const route = await this.routeService.markPickedUp(routeId, { telegramUserId });
            await this.answerCallbackQuery(query.id, `\u{1F4E6} Corrida #${routeId}: Coleta confirmada!`);
            const totalStops = route.stops?.length || 0;
            const driver = await this.driverService.getDriverByTelegramUserId(telegramUserId).catch(() => null);
            const isCar = driver?.vehicle_type === "CAR" || route.accepted_vehicle_types?.length === 1 && route.accepted_vehicle_types[0] === "CAR";
            const vIcon = isCar ? "\u{1F697}" : "\u{1F6F5}";
            const text2 = `\u{1F4E6} *Corrida #${routeId}: Coleta Confirmada!*

${totalStops} ${totalStops === 1 ? "entrega carregada" : "entregas carregadas"} para a Corrida #${routeId}.`;
            await this.sendMessage(chatId, text2, {
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: `${vIcon} INICIAR CORRIDA #${routeId}`,
                      callback_data: `route_start:${routeId}`
                    }
                  ]
                ]
              }
            });
          } catch (err) {
            await this.answerCallbackQuery(query.id, `Erro: ${err.message}`, true);
          }
          return;
        }
        if (data && data.startsWith("route_start:")) {
          const routeId = parseInt(data.replace("route_start:", "").trim(), 10);
          if (isNaN(routeId) || !this.routeService) {
            await this.answerCallbackQuery(query.id, "Dados inv\xE1lidos.", true);
            return;
          }
          try {
            const result = await this.routeService.startRoute(routeId, { telegramUserId });
            const driver = await this.driverService.getDriverByTelegramUserId(telegramUserId).catch(() => null);
            const isCar = driver?.vehicle_type === "CAR";
            await this.answerCallbackQuery(query.id, isCar ? `\u{1F697} Corrida #${routeId} iniciada!` : `\u{1F6F5} Corrida #${routeId} iniciada!`);
            if (result.nextStop) {
              await this.sendStopCard(chatId, result.route, result.nextStop);
            } else {
              await this.sendFinalRouteSummary(chatId, routeId);
            }
          } catch (err) {
            await this.answerCallbackQuery(query.id, `Erro: ${err.message}`, true);
          }
          return;
        }
        if (data && data.startsWith("stop_view:")) {
          const stopId = parseInt(data.replace("stop_view:", "").trim(), 10);
          if (isNaN(stopId) || !this.routeService) return;
          const stop = await this.routeService.getStopById(stopId);
          if (!stop) return;
          const route = await this.routeService.getRouteById(stop.route_id);
          if (!route) return;
          this.m4DriverSessions.delete(telegramUserId);
          await this.sendStopCard(chatId, route, stop);
          return;
        }
        if (data && data.startsWith("route_choose_stop:")) {
          const routeId = parseInt(data.replace("route_choose_stop:", "").trim(), 10);
          if (isNaN(routeId) || !this.routeService) return;
          const route = await this.routeService.getRouteById(routeId);
          if (!route) return;
          const pending = (route.stops || []).filter((s) => s.status === "PENDING");
          if (pending.length === 0) {
            await this.sendMessage(chatId, `Corrida #${routeId}: Todas as paradas desta corrida j\xE1 foram conclu\xEDdas ou possuem incidente.`);
            return;
          }
          const buttons = pending.map((s) => [
            {
              text: `Corrida #${routeId} \u2022 Parada #${s.sequence} - ${s.destination_neighborhood} (${s.cargo_description})`,
              callback_data: `stop_view:${s.id}`
            }
          ]);
          await this.sendMessage(chatId, `\u{1F194} *Corrida #${routeId}*

Selecione a parada que deseja realizar agora:`, {
            reply_markup: {
              inline_keyboard: buttons
            }
          });
          return;
        }
        if (data && data.startsWith("stop_deliver:")) {
          const stopId = parseInt(data.replace("stop_deliver:", "").trim(), 10);
          if (isNaN(stopId) || !this.routeService) return;
          const stop = await this.routeService.getStopById(stopId);
          if (!stop) return;
          if (stop.status !== "PENDING") {
            await this.answerCallbackQuery(query.id, "Esta parada j\xE1 foi conclu\xEDda ou possui incidente.", true);
            return;
          }
          if (stop.delivery_mode === "IN_PERSON") {
            this.m4DriverSessions.set(telegramUserId, {
              mode: "AWAITING_PIN",
              routeId: stop.route_id,
              stopId: stop.id
            });
            await this.sendMessage(
              chatId,
              `\u{1F194} *Corrida #${stop.route_id}*

Informe o PIN de entrega fornecido pelo cliente para a Entrega #${stop.sequence}:`,
              {
                reply_markup: {
                  inline_keyboard: [[{ text: "\u274C CANCELAR", callback_data: `stop_view:${stop.id}` }]]
                }
              }
            );
          } else {
            this.m4DriverSessions.set(telegramUserId, {
              mode: "AWAITING_PHOTO",
              routeId: stop.route_id,
              stopId: stop.id
            });
            await this.sendMessage(
              chatId,
              `\u{1F194} *Corrida #${stop.route_id}*

\u{1F4F7} Envie uma foto mostrando onde o pedido da Entrega #${stop.sequence} foi deixado.`,
              {
                reply_markup: {
                  inline_keyboard: [[{ text: "\u274C CANCELAR", callback_data: `stop_view:${stop.id}` }]]
                }
              }
            );
          }
          return;
        }
        if (data && data.startsWith("stop_incident:")) {
          const stopId = parseInt(data.replace("stop_incident:", "").trim(), 10);
          if (isNaN(stopId) || !this.routeService) return;
          const stop = await this.routeService.getStopById(stopId);
          if (!stop) return;
          if (stop.status !== "PENDING") {
            await this.answerCallbackQuery(query.id, "Esta parada j\xE1 foi conclu\xEDda ou possui incidente.", true);
            return;
          }
          await this.sendMessage(
            chatId,
            `\u26A0\uFE0F *Corrida #${stop.route_id} \u2014 Problema na Entrega #${stop.sequence}*

Selecione o motivo do incidente:`,
            {
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: "CLIENTE AUSENTE", callback_data: `stop_inc_choice:${stop.id}:CLIENTE_AUSENTE` }
                  ],
                  [
                    { text: "ENDERE\xC7O N\xC3O LOCALIZADO", callback_data: `stop_inc_choice:${stop.id}:ENDERECO_NAO_LOCALIZADO` }
                  ],
                  [
                    { text: "CLIENTE RECUSOU", callback_data: `stop_inc_choice:${stop.id}:CLIENTE_RECUSOU` }
                  ],
                  [
                    { text: "OUTRO MOTIVO", callback_data: `stop_inc_choice:${stop.id}:OUTRO` }
                  ],
                  [
                    { text: "\u274C VOLTAR", callback_data: `stop_view:${stop.id}` }
                  ]
                ]
              }
            }
          );
          return;
        }
        if (data && data.startsWith("stop_inc_choice:")) {
          const parts = data.replace("stop_inc_choice:", "").split(":");
          const stopId = parseInt(parts[0], 10);
          const choice = parts[1];
          if (isNaN(stopId) || !choice || !this.routeService) return;
          if (choice === "OUTRO") {
            const stop = await this.routeService.getStopById(stopId);
            if (!stop) return;
            this.m4DriverSessions.set(telegramUserId, {
              mode: "AWAITING_INCIDENT_NOTE",
              routeId: stop.route_id,
              stopId: stop.id
            });
            await this.sendMessage(
              chatId,
              `\u{1F194} *Corrida #${stop.route_id}*

Descreva brevemente o motivo do problema na Entrega #${stop.sequence}:`,
              {
                reply_markup: {
                  inline_keyboard: [[{ text: "\u274C CANCELAR", callback_data: `stop_view:${stop.id}` }]]
                }
              }
            );
            return;
          }
          try {
            const result = await this.routeService.reportStopIncident(
              stopId,
              { incident_type: choice },
              { telegramUserId }
            );
            this.m4DriverSessions.delete(telegramUserId);
            const route = await this.routeService.getRouteById(result.stop.route_id);
            let label = choice;
            if (choice === "CLIENTE_AUSENTE") label = "Cliente Ausente";
            if (choice === "ENDERECO_NAO_LOCALIZADO") label = "Endere\xE7o n\xE3o Localizado";
            if (choice === "CLIENTE_RECUSOU") label = "Cliente Recusou";
            await this.sendMessage(
              chatId,
              `\u26A0\uFE0F *Corrida #${route?.id || result.stop.route_id}*: Incidente registrado para a Entrega #${result.stop.sequence}: ${label}

Restam: ${result.remainingCount} entregas pendentes nesta corrida.`
            );
            if (result.remainingCount === 0) {
              await this.sendIncidentRouteNotification(chatId, route?.id || result.stop.route_id);
            } else if (result.nextStop && route) {
              await this.sendStopCard(chatId, route, result.nextStop);
            }
          } catch (err) {
            await this.answerCallbackQuery(query.id, `Erro: ${err.message}`, true);
          }
          return;
        }
        if (data && data.startsWith("accept_delivery:")) {
          const deliveryIdStr = data.replace("accept_delivery:", "").trim();
          const deliveryId = parseInt(deliveryIdStr, 10);
          if (isNaN(deliveryId)) {
            await this.answerCallbackQuery(query.id, "Dados inv\xE1lidos.", true);
            return;
          }
          if (!this.deliveryService) {
            await this.answerCallbackQuery(query.id, "Servi\xE7o indispon\xEDvel no momento.", true);
            return;
          }
          try {
            const result = await this.deliveryService.acceptDelivery(deliveryId, {
              telegramUserId
            });
            if (result.status === "WON") {
              await this.answerCallbackQuery(query.id, "\u2705 Entrega aceita por voc\xEA!");
              if (result.delivery) {
                await this.sendDeliveryAcceptedWon(chatId, result.delivery);
              }
            } else if (result.status === "ALREADY_WON") {
              await this.answerCallbackQuery(query.id, `Corrida #${deliveryId}: Esta entrega j\xE1 est\xE1 confirmada para voc\xEA.`);
              await this.sendMessage(chatId, `Corrida #${deliveryId}: Esta entrega j\xE1 est\xE1 confirmada para voc\xEA.`);
            } else if (result.status === "LOST") {
              await this.answerCallbackQuery(query.id, `\u274C Corrida #${deliveryId} j\xE1 foi aceita por outro motorista.`, true);
              await this.sendMessage(chatId, `\u274C Corrida #${deliveryId} j\xE1 foi aceita por outro motorista.`);
            } else {
              await this.answerCallbackQuery(query.id, `Corrida #${deliveryId}: ${result.message}`, true);
              await this.sendMessage(chatId, `Corrida #${deliveryId}: ${result.message}`);
            }
          } catch (err) {
            await this.answerCallbackQuery(query.id, "Erro ao processar aceite.", true);
          }
          return;
        }
        if (data === "noop_accepted") {
          await this.answerCallbackQuery(query.id, "\u274C Esta entrega j\xE1 foi aceita por outro motorista.", true);
          return;
        }
        if (data === "menu_start") {
          this.editSessions.delete(telegramUserId);
          if (this.driverService) {
            const driver = await this.driverService.getDriverByTelegramUserId(telegramUserId);
            if (driver) {
              await this.sendMainMenu(chatId, driver);
              return;
            }
          }
          await this.handleStartCommand(telegramUserId, chatId, query.from);
          return;
        }
        if (data === "menu_my_profile") {
          this.editSessions.delete(telegramUserId);
          await this.sendMyProfile(chatId, telegramUserId);
          return;
        }
        if (data === "req_reactivation") {
          await this.answerCallbackQuery(query.id);
          if (!this.driverService) return;
          const driver = await this.driverService.getDriverByTelegramUserId(telegramUserId);
          if (!driver || driver.status !== "BLOCKED") {
            await this.sendMessage(chatId, "Solicita\xE7\xE3o de reativa\xE7\xE3o n\xE3o aplic\xE1vel ao seu status atual.");
            return;
          }
          this.reactivationSessions.set(telegramUserId, { driverId: driver.id, type: "REACTIVATION" });
          await this.sendMessage(
            chatId,
            "\u{1F504} *Solicitar Reativa\xE7\xE3o de Cadastro*\n\nPor favor, digite o motivo ou justificativa do seu pedido de reativa\xE7\xE3o para a equipe da Kantine:\n\n_(Envie /cancelar para desistir)_"
          );
          return;
        }
        if (data === "req_reinclusion") {
          await this.answerCallbackQuery(query.id);
          await this.sendMessage(
            chatId,
            "\u26A0\uFE0F *Processo de Cadastro Reiniciado*\n\nMotoristas desligados/exclu\xEDdos t\xEAm o processo zerado e s\xF3 podem ser reinseridos atrav\xE9s de um *novo convite* e nova aprova\xE7\xE3o da administra\xE7\xE3o (pois voc\xEA pode ter mudado de ve\xEDculo, telefone ou chave Pix).\n\nPor favor, solicite um novo convite de acesso junto \xE0 equipe Kantine."
          );
          return;
        }
        if (data === "menu_my_routes") {
          await this.sendDriverActiveRoutes(chatId, telegramUserId);
          return;
        }
        if (data && data.startsWith("open_active_route:")) {
          const routeId = parseInt(data.replace("open_active_route:", "").trim(), 10);
          if (isNaN(routeId) || !this.routeService) return;
          const route = await this.routeService.getRouteById(routeId);
          if (!route) {
            await this.sendMessage(chatId, `Corrida #${routeId} n\xE3o encontrada.`);
            return;
          }
          if (route.status === "ACCEPTED") {
            await this.sendRouteAcceptedWon(chatId, route);
          } else if (route.status === "ARRIVED_PICKUP") {
            await this.sendMessage(
              chatId,
              `\u{1F4CD} *Corrida #${route.id}: Chegada na Coleta Registrada!*

Quando estiver com os pedidos carregados, clique no bot\xE3o abaixo:`,
              {
                reply_markup: {
                  inline_keyboard: [
                    [
                      {
                        text: `\u{1F4E6} PEDIDOS COLETADOS (Corrida #${route.id})`,
                        callback_data: `route_picked_up:${route.id}`
                      }
                    ]
                  ]
                }
              }
            );
          } else if (route.status === "PICKED_UP") {
            const isCar = route.accepted_vehicle_types?.length === 1 && route.accepted_vehicle_types[0] === "CAR";
            const vIcon = isCar ? "\u{1F697}" : "\u{1F6F5}";
            await this.sendMessage(
              chatId,
              `\u{1F4E6} *Corrida #${route.id}: Coleta Confirmada!*

Clique abaixo para iniciar as entregas:`,
              {
                reply_markup: {
                  inline_keyboard: [
                    [
                      {
                        text: `${vIcon} INICIAR CORRIDA #${route.id}`,
                        callback_data: `route_start:${route.id}`
                      }
                    ]
                  ]
                }
              }
            );
          } else if (route.status === "IN_TRANSIT") {
            const nextStop = await this.routeService.getNextPendingStop(route.id);
            if (nextStop) {
              await this.sendStopCard(chatId, route, nextStop);
            } else {
              await this.sendFinalRouteSummary(chatId, route.id);
            }
          } else {
            await this.sendMessage(chatId, `Corrida #${route.id} n\xE3o est\xE1 mais ativa.`);
          }
          return;
        }
        if (data === "menu_refer_driver") {
          await this.startReferralFlow(telegramUserId, chatId);
          return;
        }
        if (data === "menu_my_referrals") {
          await this.showMyReferrals(telegramUserId, chatId);
          return;
        }
        if (data === "confirm_referral") {
          const refSession = this.referralSessions.get(telegramUserId);
          if (refSession && refSession.step === "AWAITING_CONFIRMATION") {
            await this.commitReferral(telegramUserId, chatId, refSession);
          } else {
            await this.sendMessage(chatId, "Sess\xE3o de indica\xE7\xE3o expirada. Inicie novamente pelo menu.");
          }
          return;
        }
        if (data === "cancel_referral") {
          this.referralSessions.delete(telegramUserId);
          await this.sendMessage(chatId, "\u274C Indica\xE7\xE3o cancelada.\nNenhum dado foi salvo.");
          if (this.driverService) {
            const driver = await this.driverService.getDriverByTelegramUserId(telegramUserId);
            if (driver) await this.sendMainMenu(chatId, driver);
          }
          return;
        }
        if (data === "edit_profile_name") {
          if (!this.driverService) return;
          const driver = await this.driverService.getDriverByTelegramUserId(telegramUserId);
          if (!driver) return;
          this.editSessions.set(telegramUserId, { driverId: driver.id, field: "NAME", pendingData: {} });
          await this.sendMessage(chatId, "Informe seu novo *nome completo*:", {
            reply_markup: {
              inline_keyboard: [[{ text: "\u274C CANCELAR", callback_data: "cancel_edit" }]]
            }
          });
          return;
        }
        if (data === "edit_profile_phone") {
          if (!this.driverService) return;
          const driver = await this.driverService.getDriverByTelegramUserId(telegramUserId);
          if (!driver) return;
          this.editSessions.set(telegramUserId, { driverId: driver.id, field: "PHONE", pendingData: {} });
          await this.sendMessage(chatId, "Informe seu novo *telefone com DDD* (ex: 34999999999):", {
            reply_markup: {
              inline_keyboard: [[{ text: "\u274C CANCELAR", callback_data: "cancel_edit" }]]
            }
          });
          return;
        }
        if (data === "edit_profile_vehicle") {
          if (!this.driverService) return;
          const driver = await this.driverService.getDriverByTelegramUserId(telegramUserId);
          if (!driver) return;
          const initialVehs = parseDriverVehicleTypes(driver.vehicle_type);
          this.editSessions.set(telegramUserId, {
            driverId: driver.id,
            field: "VEHICLE",
            pendingData: { vehicle_types: initialVehs, vehicle_type: initialVehs.join(",") }
          });
          await this.sendMessage(
            chatId,
            "Selecione seu(s) novo(s) *tipo(s) de ve\xEDculo*:\n_(Voc\xEA pode selecionar mais de uma op\xE7\xE3o ou todas as 3)_",
            {
              reply_markup: this.getEditVehicleInlineKeyboard(initialVehs)
            }
          );
          return;
        }
        if (data && (data.startsWith("edit_veh:") || data.startsWith("edit_veh_toggle:") || data === "edit_veh_all" || data === "edit_veh_done")) {
          await this.answerCallbackQuery(query.id);
          let editSession = this.editSessions.get(telegramUserId);
          if (!editSession && this.driverService) {
            const driver = await this.driverService.getDriverByTelegramUserId(telegramUserId);
            if (driver) {
              const initVehs = parseDriverVehicleTypes(driver.vehicle_type);
              editSession = { driverId: driver.id, field: "VEHICLE", pendingData: { vehicle_types: initVehs } };
              this.editSessions.set(telegramUserId, editSession);
            }
          }
          if (editSession) {
            const driver = await this.driverService.getDriverById(editSession.driverId);
            let selected = editSession.pendingData.vehicle_types || [];
            if (data === "edit_veh_all") {
              selected = ["CAR", "MOTO", "MOTO_WITH_BAG"];
              editSession.pendingData.vehicle_types = selected;
              editSession.pendingData.vehicle_type = selected.join(",");
              await this.editMessageReplyMarkup(chatId, query.message.message_id, {
                reply_markup: this.getEditVehicleInlineKeyboard(selected)
              }).catch(() => {
              });
              return;
            }
            if (data.startsWith("edit_veh_toggle:")) {
              const v = data.replace("edit_veh_toggle:", "");
              if (selected.includes(v)) {
                selected = selected.filter((x) => x !== v);
              } else {
                selected.push(v);
              }
              editSession.pendingData.vehicle_types = selected;
              editSession.pendingData.vehicle_type = selected.join(",");
              await this.editMessageReplyMarkup(chatId, query.message.message_id, {
                reply_markup: this.getEditVehicleInlineKeyboard(selected)
              }).catch(() => {
              });
              return;
            }
            if (data === "edit_veh_done") {
              if (selected.length === 0) {
                await this.sendMessage(chatId, "\u26A0\uFE0F Por favor, selecione ao menos um tipo de ve\xEDculo antes de confirmar.", {
                  reply_markup: this.getEditVehicleInlineKeyboard(selected)
                });
                return;
              }
              editSession.pendingData.vehicle_type = selected.join(",");
              editSession.field = "CONFIRM";
              const oldVehLabel2 = driver ? getVehicleTypeLabel(driver.vehicle_type) : "";
              const newVehLabel2 = getVehicleTypeLabel(selected.join(","));
              const msg2 = `<b>CONFIRMAR ALTERA\xC7\xC3O DE VE\xCDCULO(S)</b>

<b>Ve\xEDculo(s) atual(is):</b> ${escapeHtml(oldVehLabel2)}
<b>Novo(s) ve\xEDculo(s):</b> ${escapeHtml(newVehLabel2)}`;
              await this.sendMessage(chatId, msg2, {
                parse_mode: "HTML",
                reply_markup: {
                  inline_keyboard: [
                    [
                      { text: "\u2705 CONFIRMAR", callback_data: "confirm_edit" },
                      { text: "\u274C CANCELAR", callback_data: "cancel_edit" }
                    ]
                  ]
                }
              });
              return;
            }
            const chosenVeh = data.replace("edit_veh:", "");
            editSession.pendingData.vehicle_type = chosenVeh;
            editSession.pendingData.vehicle_types = [chosenVeh];
            editSession.field = "CONFIRM";
            const oldVehLabel = driver ? getVehicleTypeLabel(driver.vehicle_type) : "";
            const newVehLabel = getVehicleTypeLabel(chosenVeh);
            const msg = `<b>CONFIRMAR ALTERA\xC7\xC3O DE VE\xCDCULO</b>

<b>Ve\xEDculo atual:</b> ${escapeHtml(oldVehLabel)}
<b>Novo ve\xEDculo:</b> ${escapeHtml(newVehLabel)}`;
            await this.sendMessage(chatId, msg, {
              parse_mode: "HTML",
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: "\u2705 CONFIRMAR", callback_data: "confirm_edit" },
                    { text: "\u274C CANCELAR", callback_data: "cancel_edit" }
                  ]
                ]
              }
            });
            return;
          }
          return;
        }
        if (data === "edit_profile_pix") {
          if (!this.driverService) return;
          const driver = await this.driverService.getDriverByTelegramUserId(telegramUserId);
          if (!driver) return;
          this.editSessions.set(telegramUserId, { driverId: driver.id, field: "PIX_TYPE", pendingData: {} });
          await this.sendMessage(chatId, "Selecione o novo *tipo de chave Pix*:", {
            reply_markup: {
              inline_keyboard: [
                [
                  { text: "CPF", callback_data: "edit_pixtype:CPF" },
                  { text: "TELEFONE", callback_data: "edit_pixtype:PHONE" }
                ],
                [
                  { text: "E-MAIL", callback_data: "edit_pixtype:EMAIL" },
                  { text: "ALEAT\xD3RIA", callback_data: "edit_pixtype:RANDOM" }
                ],
                [{ text: "\u274C CANCELAR", callback_data: "cancel_edit" }]
              ]
            }
          });
          return;
        }
        if (data && data.startsWith("edit_pixtype:")) {
          const chosenPixType = data.replace("edit_pixtype:", "");
          let editSession = this.editSessions.get(telegramUserId);
          if (!editSession && this.driverService) {
            const driver = await this.driverService.getDriverByTelegramUserId(telegramUserId);
            if (driver) {
              editSession = { driverId: driver.id, field: "PIX_TYPE", pendingData: {} };
              this.editSessions.set(telegramUserId, editSession);
            }
          }
          if (editSession) {
            editSession.pendingData.pix_key_type = chosenPixType;
            editSession.field = "PIX_VALUE";
            let promptMsg = "Informe sua nova chave Pix:";
            if (chosenPixType === "CPF") promptMsg = "Informe o *CPF* utilizado como chave Pix:";
            if (chosenPixType === "PHONE") promptMsg = "Informe o *telefone com DDD* utilizado como chave Pix (ex: 34999999999):";
            if (chosenPixType === "EMAIL") promptMsg = "Informe o *e-mail* utilizado como chave Pix:";
            if (chosenPixType === "RANDOM") promptMsg = "Informe a *chave aleat\xF3ria (UUID)* utilizada como chave Pix:";
            await this.sendMessage(chatId, promptMsg, {
              reply_markup: {
                inline_keyboard: [[{ text: "\u274C CANCELAR", callback_data: "cancel_edit" }]]
              }
            });
          }
          return;
        }
        if (data === "confirm_edit") {
          const editSession = this.editSessions.get(telegramUserId);
          if (editSession) {
            await this.executeProfileEdit(telegramUserId, chatId, editSession);
          } else {
            await this.sendMessage(chatId, "Sess\xE3o expirada. Por favor, acesse seu cadastro novamente.");
            await this.sendMyProfile(chatId, telegramUserId);
          }
          return;
        }
        if (data === "cancel_edit") {
          this.editSessions.delete(telegramUserId);
          await this.sendMessage(chatId, "Altera\xE7\xE3o cancelada.");
          await this.sendMyProfile(chatId, telegramUserId);
          return;
        }
        const session = await this.getSession(telegramUserId);
        if (data === "force_restart_cadastro" || data === "start_cadastro") {
          await this.answerCallbackQuery(query.id);
          await this.deleteSession(telegramUserId);
          const newSession = {
            step: "NAME",
            data: {
              invite_token: "convite_geral"
            },
            lastPromptTime: Date.now()
          };
          await this.saveSession(telegramUserId, newSession);
          await this.sendMessage(
            chatId,
            `\u{1F44B} Ol\xE1! Vamos dar in\xEDcio ao seu cadastro na *Kantine Entregas*! \u{1F680}

Para come\xE7ar, por favor informe seu *nome completo*:`
          );
          return;
        }
        if (data === "cancel_reg") {
          await this.answerCallbackQuery(query.id);
          await this.deleteSession(telegramUserId);
          await this.sendMessage(
            chatId,
            "Cadastro cancelado.\nQuando quiser recome\xE7ar, envie /start.",
            { reply_markup: { remove_keyboard: true } }
          );
          return;
        }
        if (data && (data.startsWith("veh_") || data.startsWith("veh_toggle:"))) {
          await this.answerCallbackQuery(query.id);
          if (session && (session.step === "VEHICLE" || session.step === "PHONE")) {
            let currentSelected = session.data.vehicle_types || [];
            if (currentSelected.length === 0 && session.data.vehicle_type) {
              currentSelected = parseDriverVehicleTypes(session.data.vehicle_type);
            }
            if (data === "veh_all") {
              currentSelected = ["CAR", "MOTO", "MOTO_WITH_BAG"];
              session.data.vehicle_types = currentSelected;
              session.data.vehicle_type = currentSelected.join(",");
              await this.saveSession(telegramUserId, session);
              await this.editMessageReplyMarkup(chatId, query.message?.message_id, {
                reply_markup: this.getVehicleInlineKeyboard(currentSelected)
              }).catch(() => {
              });
              return;
            }
            if (data.startsWith("veh_toggle:")) {
              const v = data.replace("veh_toggle:", "");
              if (currentSelected.includes(v)) {
                currentSelected = currentSelected.filter((x) => x !== v);
              } else {
                currentSelected.push(v);
              }
              session.data.vehicle_types = currentSelected;
              session.data.vehicle_type = currentSelected.join(",");
              await this.saveSession(telegramUserId, session);
              await this.editMessageReplyMarkup(chatId, query.message?.message_id, {
                reply_markup: this.getVehicleInlineKeyboard(currentSelected)
              }).catch(() => {
              });
              return;
            }
            if (data === "veh_done") {
              if (currentSelected.length === 0) {
                await this.sendMessage(chatId, "\u26A0\uFE0F Por favor, selecione ao menos um tipo de ve\xEDculo antes de prosseguir.", {
                  reply_markup: this.getVehicleInlineKeyboard(currentSelected)
                });
                return;
              }
              session.data.vehicle_type = currentSelected.join(",");
              session.data.vehicle_types = currentSelected;
              session.step = "PIX_TYPE";
              await this.saveSession(telegramUserId, session);
              await this.sendMessage(
                chatId,
                "Selecione o *tipo de chave Pix* para recebimento dos repasses:",
                {
                  reply_markup: {
                    inline_keyboard: [
                      [
                        { text: "CPF", callback_data: "reg_pixtype:CPF" },
                        { text: "TELEFONE", callback_data: "reg_pixtype:PHONE" }
                      ],
                      [
                        { text: "E-MAIL", callback_data: "reg_pixtype:EMAIL" },
                        { text: "ALEAT\xD3RIA", callback_data: "reg_pixtype:RANDOM" }
                      ]
                    ]
                  }
                }
              );
              return;
            }
            const parsed = parseVehicleInput(data);
            if (parsed) {
              session.data.vehicle_types = [parsed];
              session.data.vehicle_type = parsed;
              session.step = "PIX_TYPE";
              await this.saveSession(telegramUserId, session);
              await this.sendMessage(
                chatId,
                "Selecione o *tipo de chave Pix* para recebimento dos repasses:",
                {
                  reply_markup: {
                    inline_keyboard: [
                      [
                        { text: "CPF", callback_data: "reg_pixtype:CPF" },
                        { text: "TELEFONE", callback_data: "reg_pixtype:PHONE" }
                      ],
                      [
                        { text: "E-MAIL", callback_data: "reg_pixtype:EMAIL" },
                        { text: "ALEAT\xD3RIA", callback_data: "reg_pixtype:RANDOM" }
                      ]
                    ]
                  }
                }
              );
            }
          }
          return;
        }
        if (data && data.startsWith("reg_pixtype:")) {
          await this.answerCallbackQuery(query.id);
          const chosenPixType = data.replace("reg_pixtype:", "");
          if (session && (session.step === "PIX_TYPE" || session.step === "VEHICLE")) {
            session.data.pix_key_type = chosenPixType;
            session.step = "PIX_VALUE";
            await this.saveSession(telegramUserId, session);
            let promptMsg = "Informe sua chave Pix:";
            if (chosenPixType === "CPF") promptMsg = "Informe o *CPF* (11 d\xEDgitos, ex: 123.456.789-00) utilizado como chave Pix:";
            if (chosenPixType === "PHONE") promptMsg = "Informe o *telefone com DDD* utilizado como chave Pix (ex: 34999999999):";
            if (chosenPixType === "EMAIL") promptMsg = "Informe o *e-mail* utilizado como chave Pix:";
            if (chosenPixType === "RANDOM") promptMsg = "Informe a *chave aleat\xF3ria (UUID)* utilizada como chave Pix:";
            await this.sendMessage(chatId, promptMsg);
          }
          return;
        }
        if (data === "confirm_reg") {
          await this.answerCallbackQuery(query.id);
          if (!session) {
            await this.sendMessage(
              chatId,
              "\u26A0\uFE0F Sess\xE3o n\xE3o encontrada. Por favor, envie /start para iniciar seu cadastro."
            );
            return;
          }
          if (!session.data.name) {
            session.step = "NAME";
            await this.saveSession(telegramUserId, session);
            await this.sendMessage(chatId, "Por favor, informe seu *nome completo*:");
            return;
          }
          if (!session.data.phone) {
            session.step = "PHONE";
            await this.saveSession(telegramUserId, session);
            await this.sendMessage(chatId, "Por favor, informe seu *telefone com DDD* (ex: 34999999999):");
            return;
          }
          if (!session.data.vehicle_type) {
            session.step = "VEHICLE";
            await this.saveSession(telegramUserId, session);
            await this.sendMessage(chatId, "Selecione o *tipo de ve\xEDculo*:", {
              reply_markup: this.getVehicleInlineKeyboard()
            });
            return;
          }
          if (!session.data.pix_key_value && !session.data.pix_key) {
            if (session.data.pix_key_type) {
              session.step = "PIX_VALUE";
              await this.saveSession(telegramUserId, session);
              let promptMsg = "Informe sua chave Pix:";
              if (session.data.pix_key_type === "CPF") promptMsg = "Informe o *CPF* (11 d\xEDgitos, ex: 123.456.789-00) utilizado como chave Pix:";
              if (session.data.pix_key_type === "PHONE") promptMsg = "Informe o *telefone com DDD* utilizado como chave Pix (ex: 34999999999):";
              if (session.data.pix_key_type === "EMAIL") promptMsg = "Informe o *e-mail* utilizado como chave Pix:";
              if (session.data.pix_key_type === "RANDOM") promptMsg = "Informe a *chave aleat\xF3ria (UUID)* utilizada como chave Pix:";
              await this.sendMessage(chatId, promptMsg);
              return;
            }
            session.step = "PIX_TYPE";
            await this.saveSession(telegramUserId, session);
            await this.sendMessage(
              chatId,
              "Selecione o *tipo de chave Pix* para recebimento dos repasses:",
              {
                reply_markup: {
                  inline_keyboard: [
                    [
                      { text: "CPF", callback_data: "reg_pixtype:CPF" },
                      { text: "TELEFONE", callback_data: "reg_pixtype:PHONE" }
                    ],
                    [
                      { text: "E-MAIL", callback_data: "reg_pixtype:EMAIL" },
                      { text: "ALEAT\xD3RIA", callback_data: "reg_pixtype:RANDOM" }
                    ]
                  ]
                }
              }
            );
            return;
          }
          await this.commitRegistration(telegramUserId, chatId, session);
        }
      }
      async commitRegistration(telegramUserId, chatId, session) {
        if (!this.driverService) {
          await this.sendMessage(chatId, "Erro no servi\xE7o. Tente novamente mais tarde.");
          return;
        }
        try {
          const vType = session.data.vehicle_type || "CAR";
          const pixVal = session.data.pix_key_value || session.data.pix_key || "";
          const pixType = session.data.pix_key_type || "CPF";
          await this.driverService.registerDriver({
            telegram_user_id: telegramUserId,
            telegram_chat_id: chatId,
            name: session.data.name,
            phone: session.data.phone,
            vehicle_type: vType,
            pix_key: pixVal,
            pix_key_type: pixType,
            pix_key_value: pixVal,
            invite_token: session.data.invite_token || "convite_geral"
          });
          await this.deleteSession(telegramUserId);
          const vehicleLabel = getVehicleTypeLabel(vType);
          const masked = maskPixKey(pixType, pixVal);
          const responseMsg = `\u{1F389} *CADASTRO CONCLU\xCDDO COM SUCESSO!* \u{1F680}

Ol\xE1, *${escapeHtml(session.data.name)}*!

Seu cadastro foi registrado com sucesso:
\u2022 *Telefone:* ${escapeHtml(session.data.phone)}
\u2022 *Ve\xEDculo:* ${escapeHtml(vehicleLabel)}
\u2022 *Chave Pix (${escapeHtml(pixType)}):* ${escapeHtml(masked)}

Sua solicita\xE7\xE3o est\xE1 agora na fila de aprova\xE7\xE3o da equipe Kantine.
Assim que for ativado, voc\xEA receber\xE1 uma notifica\xE7\xE3o aqui no Telegram!`;
          await this.sendMessage(chatId, responseMsg, {
            reply_markup: { remove_keyboard: true }
          });
        } catch (err) {
          if (err.message === "DRIVER_ALREADY_EXISTS") {
            await this.deleteSession(telegramUserId);
            const existing = await this.driverService.getDriverByTelegramUserId(telegramUserId);
            if (existing) {
              await this.sendMainMenu(chatId, existing);
            } else {
              await this.sendMessage(chatId, "Voc\xEA j\xE1 possui cadastro no sistema Kantine Entregas.");
            }
            return;
          }
          console.error("[Telegram Bot] Registration commit error:", err.message);
          await this.sendMessage(
            chatId,
            `Ocorreu um erro ao processar seu cadastro: ${err.message || "Tente novamente enviando /start."}`
          );
        }
      }
    };
    telegramBot = new TelegramBotService();
  }
});

// src/server/driverService.ts
import { eq as eq6, desc as desc4, sql as sql6 } from "drizzle-orm";
function escapeTelegramMarkdown(str) {
  if (!str) return "";
  return str.replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
}
var DriverService, driverService;
var init_driverService = __esm({
  "src/server/driverService.ts"() {
    init_db();
    init_schema();
    init_types();
    init_eligibility();
    init_telegramBot();
    init_pixValidation();
    DriverService = class {
      async getDrivers(statusFilter) {
        try {
          let result = [];
          if (statusFilter) {
            result = await db.select().from(drivers).where(eq6(drivers.status, statusFilter)).orderBy(desc4(drivers.created_at));
          } else {
            result = await db.select().from(drivers).orderBy(desc4(drivers.created_at));
          }
          if (process.env.SQL_DB_NAME !== "cloud_sql_production_database") {
            try {
              const prodDrivers = await prodDb.select().from(drivers).orderBy(desc4(drivers.created_at));
              const existingIds = new Set(result.map((d) => d.id));
              const existingUserIds = new Set(result.map((d) => d.telegram_user_id));
              for (const pd of prodDrivers) {
                if (!existingIds.has(pd.id) && !existingUserIds.has(pd.telegram_user_id)) {
                  if (!statusFilter || pd.status === statusFilter) {
                    result.push(pd);
                  }
                  await db.insert(drivers).values(pd).onConflictDoNothing().catch(() => {
                  });
                }
              }
            } catch (syncErr) {
              console.warn("[DriverService.getDrivers] Sync from prodDb warning:", syncErr?.message);
            }
          }
          return result;
        } catch (err) {
          console.error("[DriverService.getDrivers failed]", err);
          throw new Error("Failed to retrieve drivers", { cause: err });
        }
      }
      async getDriverById(id) {
        try {
          const results = await db.select().from(drivers).where(eq6(drivers.id, id));
          if (results[0]) return results[0];
          if (process.env.SQL_DB_NAME !== "cloud_sql_production_database") {
            const prodResults = await prodDb.select().from(drivers).where(eq6(drivers.id, id));
            if (prodResults[0]) {
              await db.insert(drivers).values(prodResults[0]).onConflictDoNothing().catch(() => {
              });
              return prodResults[0];
            }
          }
          return null;
        } catch (err) {
          console.error(`[DriverService.getDriverById failed for id ${id}]`, err);
          throw new Error(`Failed to retrieve driver #${id}`, { cause: err });
        }
      }
      async getDriverByTelegramUserId(telegramUserId) {
        try {
          const results = await db.select().from(drivers).where(eq6(drivers.telegram_user_id, telegramUserId));
          if (results[0]) return results[0];
          if (process.env.SQL_DB_NAME !== "cloud_sql_production_database") {
            const prodResults = await prodDb.select().from(drivers).where(eq6(drivers.telegram_user_id, telegramUserId));
            if (prodResults[0]) {
              await db.insert(drivers).values(prodResults[0]).onConflictDoNothing().catch(() => {
              });
              return prodResults[0];
            }
          }
          return null;
        } catch (err) {
          console.error(`[DriverService.getDriverByTelegramUserId failed]`, err);
          throw new Error("Failed to find driver by Telegram User ID", { cause: err });
        }
      }
      async getDriverByPhone(phone) {
        try {
          const cleanPhone = normalizeGeneralPhone(phone);
          const digits = phone.replace(/\D/g, "");
          const rawLocal = digits.startsWith("55") && digits.length > 10 ? digits.slice(2) : digits;
          const allDrivers = await db.select().from(drivers);
          let found = allDrivers.find((d) => {
            if (!d.phone) return false;
            const dClean = normalizeGeneralPhone(d.phone);
            const dDigits = d.phone.replace(/\D/g, "");
            const dLocal = dDigits.startsWith("55") && dDigits.length > 10 ? dDigits.slice(2) : dDigits;
            return d.phone === cleanPhone || d.phone === phone || dClean === cleanPhone || rawLocal.length >= 8 && dLocal === rawLocal;
          });
          if (found) return found;
          if (process.env.SQL_DB_NAME !== "cloud_sql_production_database") {
            const prodDrivers = await prodDb.select().from(drivers);
            found = prodDrivers.find((d) => {
              if (!d.phone) return false;
              const dClean = normalizeGeneralPhone(d.phone);
              const dDigits = d.phone.replace(/\D/g, "");
              const dLocal = dDigits.startsWith("55") && dDigits.length > 10 ? dDigits.slice(2) : dDigits;
              return d.phone === cleanPhone || d.phone === phone || dClean === cleanPhone || rawLocal.length >= 8 && dLocal === rawLocal;
            });
            if (found) {
              await db.insert(drivers).values(found).onConflictDoNothing().catch(() => {
              });
              return found;
            }
          }
          return null;
        } catch (err) {
          console.error(`[DriverService.getDriverByPhone failed]`, err);
          return null;
        }
      }
      async registerDriver(data) {
        const parsedVehicles = parseDriverVehicleTypes(data.vehicle_type);
        if (parsedVehicles.length === 0) {
          throw new Error(`INVALID_VEHICLE_TYPE: ${data.vehicle_type}`);
        }
        let canonicalVehicle = data.vehicle_type;
        if (parsedVehicles.length > 1) {
          canonicalVehicle = parsedVehicles.join(",");
        } else if (["CAR_HATCH", "CAR_SEDAN", "CAR_SW", "OTHER"].includes(data.vehicle_type)) {
          canonicalVehicle = data.vehicle_type;
        } else {
          canonicalVehicle = parsedVehicles[0];
        }
        if (!data.name || !data.phone || !data.telegram_user_id) {
          throw new Error("MISSING_REQUIRED_FIELDS");
        }
        let canonicalPixType = "REQUIRES_UPDATE";
        let canonicalPixValue = "";
        if (data.pix_key_type) {
          const val = data.pix_key_value || data.pix_key || "";
          const validation = validateAndNormalizePix(data.pix_key_type, val);
          if (!validation.isValid) {
            throw new Error(`INVALID_PIX_KEY: ${validation.error}`);
          }
          canonicalPixType = data.pix_key_type;
          canonicalPixValue = validation.canonical;
        } else if (data.pix_key) {
          canonicalPixValue = data.pix_key.trim();
          canonicalPixType = "REQUIRES_UPDATE";
        } else {
          throw new Error("MISSING_REQUIRED_FIELDS");
        }
        let existing = await this.getDriverByTelegramUserId(data.telegram_user_id);
        if (!existing) {
          existing = await this.getDriverByPhone(data.phone.trim());
        }
        if (existing) {
          if (existing.status === "EXCLUDED" || existing.is_excluded) {
            if (!data.invite_token) {
              throw new Error(
                "EXCLUDED_DRIVER_REQUIRES_NEW_INVITE: Motoristas exclu\xEDdos t\xEAm o processo zerado e s\xF3 podem ser reinseridos atrav\xE9s de novo convite e aprova\xE7\xE3o."
              );
            }
          }
          if (data.invite_token || existing.status === "EXCLUDED" || existing.is_excluded || existing.status === "PENDING") {
            const prevReason = existing.exclusion_reason || existing.previous_exclusion_reason || "Desativa\xE7\xE3o anterior";
            const newExclusionCount = existing.is_excluded ? (existing.exclusion_count || 0) + 1 : existing.exclusion_count || 0;
            const updated = await db.update(drivers).set({
              telegram_user_id: data.telegram_user_id,
              telegram_chat_id: data.telegram_chat_id,
              name: data.name.trim(),
              phone: data.phone.trim(),
              vehicle_type: canonicalVehicle,
              pix_key: canonicalPixValue,
              pix_key_type: canonicalPixType,
              pix_key_value: canonicalPixValue,
              status: "PENDING",
              is_excluded: false,
              excluded_at: null,
              exclusion_reason: null,
              excluded_by: null,
              previous_exclusion_reason: prevReason,
              exclusion_count: newExclusionCount,
              reactivation_requested: false,
              reactivation_reason: null,
              reactivation_requested_at: null,
              reinclusion_requested: false,
              reinclusion_reason: null,
              reinclusion_requested_at: null,
              updated_at: /* @__PURE__ */ new Date()
            }).where(eq6(drivers.id, existing.id)).returning();
            const reincluded = updated[0] || existing;
            await db.insert(driverEvents).values({
              driver_id: existing.id,
              event_type: "DRIVER_REGISTERED",
              actor_type: "DRIVER",
              actor_id: data.telegram_user_id,
              details: JSON.stringify({
                via_invite_token: data.invite_token || null,
                new_vehicle: canonicalVehicle,
                new_phone: data.phone.trim(),
                new_pix: canonicalPixValue
              })
            });
            if (data.invite_token) {
              await db.update(driverInvitations).set({
                status: "COMPLETED",
                telegram_user_id: data.telegram_user_id,
                driver_id: existing.id,
                completed_at: /* @__PURE__ */ new Date()
              }).where(eq6(driverInvitations.token, data.invite_token)).catch(() => {
              });
            }
            if (process.env.SQL_DB_NAME !== "cloud_sql_production_database") {
              try {
                await prodDb.update(drivers).set({
                  telegram_user_id: data.telegram_user_id,
                  telegram_chat_id: data.telegram_chat_id,
                  name: data.name.trim(),
                  phone: data.phone.trim(),
                  vehicle_type: canonicalVehicle,
                  pix_key: canonicalPixValue,
                  pix_key_type: canonicalPixType,
                  pix_key_value: canonicalPixValue,
                  status: "PENDING",
                  is_excluded: false,
                  excluded_at: null,
                  exclusion_reason: null,
                  excluded_by: null,
                  previous_exclusion_reason: prevReason,
                  exclusion_count: newExclusionCount,
                  reactivation_requested: false,
                  reactivation_reason: null,
                  reactivation_requested_at: null,
                  reinclusion_requested: false,
                  reinclusion_reason: null,
                  reinclusion_requested_at: null,
                  updated_at: /* @__PURE__ */ new Date()
                }).where(eq6(drivers.id, existing.id)).catch(() => {
                });
                if (data.invite_token) {
                  await prodDb.update(driverInvitations).set({
                    status: "COMPLETED",
                    telegram_user_id: data.telegram_user_id,
                    driver_id: existing.id,
                    completed_at: /* @__PURE__ */ new Date()
                  }).where(eq6(driverInvitations.token, data.invite_token)).catch(() => {
                  });
                }
              } catch (e) {
                console.warn("[DriverService] Mirror re-registered driver to prod warning:", e?.message);
              }
            }
            return reincluded;
          }
          throw new Error("DRIVER_ALREADY_EXISTS");
        }
        try {
          const inserted = await db.insert(drivers).values({
            telegram_user_id: data.telegram_user_id,
            telegram_chat_id: data.telegram_chat_id,
            name: data.name.trim(),
            phone: data.phone.trim(),
            vehicle_type: canonicalVehicle,
            pix_key: canonicalPixValue,
            pix_key_type: canonicalPixType,
            pix_key_value: canonicalPixValue,
            status: "PENDING"
          }).returning();
          const newDriver = inserted[0];
          await db.insert(driverEvents).values({
            driver_id: newDriver.id,
            event_type: "DRIVER_REGISTERED",
            actor_type: "DRIVER",
            actor_id: data.telegram_user_id
          });
          try {
            if (data.invite_token) {
              await db.update(driverInvitations).set({
                status: "COMPLETED",
                telegram_user_id: data.telegram_user_id,
                driver_id: newDriver.id,
                completed_at: /* @__PURE__ */ new Date()
              }).where(eq6(driverInvitations.token, data.invite_token));
            } else if (data.phone) {
              await db.update(driverInvitations).set({
                status: "COMPLETED",
                telegram_user_id: data.telegram_user_id,
                driver_id: newDriver.id,
                completed_at: /* @__PURE__ */ new Date()
              }).where(eq6(driverInvitations.phone, data.phone.trim()));
            }
          } catch (invErr) {
            console.warn("[DriverService] Note: Failed to link invitation:", invErr?.message);
          }
          try {
            if (data.invite_token) {
              const cleanToken = data.invite_token.replace(/^invite_/, "").trim();
              await db.update(driverReferrals).set({
                resulting_driver_id: newDriver.id,
                updated_at: /* @__PURE__ */ new Date()
              }).where(eq6(driverReferrals.invitation_token, cleanToken));
            }
            await db.update(driverReferrals).set({
              resulting_driver_id: newDriver.id,
              updated_at: /* @__PURE__ */ new Date()
            }).where(eq6(driverReferrals.invited_telegram_user_id, data.telegram_user_id));
          } catch (refErr) {
            console.warn("[DriverService] Note: Failed to link referral:", refErr?.message);
          }
          if (process.env.SQL_DB_NAME !== "cloud_sql_production_database") {
            try {
              await prodDb.insert(drivers).values(newDriver).onConflictDoUpdate({
                target: drivers.telegram_user_id,
                set: {
                  name: newDriver.name,
                  phone: newDriver.phone,
                  vehicle_type: newDriver.vehicle_type,
                  pix_key: newDriver.pix_key,
                  pix_key_type: newDriver.pix_key_type,
                  pix_key_value: newDriver.pix_key_value,
                  status: newDriver.status,
                  updated_at: /* @__PURE__ */ new Date()
                }
              });
              await prodDb.insert(driverEvents).values({
                driver_id: newDriver.id,
                event_type: "DRIVER_REGISTERED",
                actor_type: "DRIVER",
                actor_id: data.telegram_user_id
              }).catch(() => {
              });
              if (data.invite_token) {
                await prodDb.update(driverInvitations).set({
                  status: "COMPLETED",
                  telegram_user_id: data.telegram_user_id,
                  driver_id: newDriver.id,
                  completed_at: /* @__PURE__ */ new Date()
                }).where(eq6(driverInvitations.token, data.invite_token)).catch(() => {
                });
              }
            } catch (mErr) {
              console.warn("[DriverService.registerDriver] Mirror to prodDb failed:", mErr?.message);
            }
          }
          return newDriver;
        } catch (err) {
          if (err?.code === "23505" && (err?.constraint === "drivers_telegram_user_id_unique" || !err?.constraint)) {
            try {
              const updated = await db.update(drivers).set({
                name: data.name.trim(),
                phone: data.phone.trim(),
                vehicle_type: canonicalVehicle,
                pix_key: canonicalPixValue,
                pix_key_type: canonicalPixType,
                pix_key_value: canonicalPixValue,
                status: "PENDING",
                updated_at: /* @__PURE__ */ new Date()
              }).where(eq6(drivers.telegram_user_id, data.telegram_user_id)).returning();
              if (updated[0]) {
                if (process.env.SQL_DB_NAME !== "cloud_sql_production_database") {
                  await prodDb.update(drivers).set({
                    name: data.name.trim(),
                    phone: data.phone.trim(),
                    vehicle_type: canonicalVehicle,
                    pix_key: canonicalPixValue,
                    pix_key_type: canonicalPixType,
                    pix_key_value: canonicalPixValue,
                    status: "PENDING",
                    updated_at: /* @__PURE__ */ new Date()
                  }).where(eq6(drivers.telegram_user_id, data.telegram_user_id)).catch(() => {
                  });
                }
                return updated[0];
              }
            } catch (updateErr) {
              console.error("[DriverService.registerDriver] Fallback update failed:", updateErr?.message);
            }
            throw new Error("DRIVER_ALREADY_EXISTS");
          }
          if (err?.code === "23505" && err?.constraint === "drivers_pkey") {
            try {
              await db.execute(sql6`SELECT setval(pg_get_serial_sequence('drivers', 'id'), COALESCE((SELECT MAX(id) FROM drivers), 1) + 1, false)`);
              const retryInserted = await db.insert(drivers).values({
                telegram_user_id: data.telegram_user_id,
                telegram_chat_id: data.telegram_chat_id,
                name: data.name.trim(),
                phone: data.phone.trim(),
                vehicle_type: canonicalVehicle,
                pix_key: canonicalPixValue,
                pix_key_type: canonicalPixType,
                pix_key_value: canonicalPixValue,
                status: "PENDING"
              }).returning();
              if (retryInserted[0]) return retryInserted[0];
            } catch (retryErr) {
              console.error("[DriverService.registerDriver retry failed]", retryErr);
            }
          }
          console.error("[DriverService.registerDriver failed]", err);
          const userFriendlyMsg = err?.detail || err?.message || "Falha ao gravar cadastro";
          throw new Error(userFriendlyMsg, { cause: err });
        }
      }
      /**
       * M1.1: Updates driver profile (name, phone, vehicle_type, pix)
       * Strictly protects id, telegram_user_id, telegram_chat_id, status, created_at.
       * Records atomic DRIVER_PROFILE_UPDATED events in driver_events.
       */
      async updateDriverProfile(driverId, updates, context) {
        if (updates.status !== void 0 || updates.id !== void 0 || updates.telegram_user_id !== void 0 || updates.telegram_chat_id !== void 0 || updates.created_at !== void 0) {
          throw new Error("PROTECTED_FIELDS_CANNOT_BE_MODIFIED");
        }
        const driver = await this.getDriverById(driverId);
        if (!driver) {
          throw new Error("DRIVER_NOT_FOUND");
        }
        const setPayload = {
          updated_at: /* @__PURE__ */ new Date()
        };
        const auditEventsToInsert = [];
        if (updates.name !== void 0) {
          const trimmedName = updates.name.trim();
          if (trimmedName.length < 2) {
            throw new Error("INVALID_NAME: O nome deve ter pelo menos 2 caracteres.");
          }
          if (trimmedName !== driver.name) {
            setPayload.name = trimmedName;
            auditEventsToInsert.push({
              driver_id: driverId,
              event_type: "DRIVER_PROFILE_UPDATED",
              actor_type: context.actor_type,
              actor_id: context.actor_id || null,
              field_changed: "name",
              old_value: driver.name,
              new_value: trimmedName
            });
          }
        }
        if (updates.phone !== void 0) {
          const cleanedDigits = updates.phone.replace(/\D/g, "");
          if (cleanedDigits.length < 8) {
            throw new Error("INVALID_PHONE: Telefone inv\xE1lido.");
          }
          const formattedPhone = normalizeGeneralPhone(updates.phone);
          if (formattedPhone !== driver.phone) {
            setPayload.phone = formattedPhone;
            auditEventsToInsert.push({
              driver_id: driverId,
              event_type: "DRIVER_PROFILE_UPDATED",
              actor_type: context.actor_type,
              actor_id: context.actor_id || null,
              field_changed: "phone",
              old_value: driver.phone,
              new_value: formattedPhone
            });
          }
        }
        if (updates.vehicle_type !== void 0) {
          const parsedVehicles = parseDriverVehicleTypes(updates.vehicle_type);
          if (parsedVehicles.length === 0) {
            throw new Error(`INVALID_VEHICLE_TYPE: ${updates.vehicle_type}`);
          }
          let canonicalVeh = updates.vehicle_type;
          if (parsedVehicles.length > 1) {
            canonicalVeh = parsedVehicles.join(",");
          } else if (["CAR_HATCH", "CAR_SEDAN", "CAR_SW", "OTHER"].includes(updates.vehicle_type)) {
            canonicalVeh = updates.vehicle_type;
          } else {
            canonicalVeh = parsedVehicles[0];
          }
          if (canonicalVeh !== driver.vehicle_type) {
            setPayload.vehicle_type = canonicalVeh;
            auditEventsToInsert.push({
              driver_id: driverId,
              event_type: "DRIVER_PROFILE_UPDATED",
              actor_type: context.actor_type,
              actor_id: context.actor_id || null,
              field_changed: "vehicle_type",
              old_value: driver.vehicle_type,
              new_value: canonicalVeh
            });
          }
        }
        const targetPixType = updates.pix?.pix_key_type || updates.pix_key_type;
        const targetPixValue = updates.pix?.pix_key_value || updates.pix_key_value;
        if (targetPixType !== void 0 || targetPixValue !== void 0) {
          if (!targetPixType || !targetPixValue) {
            throw new Error("INVALID_PIX_UPDATE: Tipo e valor Pix devem ser atualizados conjuntamente.");
          }
          const valRes = validateAndNormalizePix(targetPixType, targetPixValue);
          if (!valRes.isValid) {
            throw new Error(valRes.error || "INVALID_PIX_KEY");
          }
          const canonicalVal = valRes.canonical;
          const canonicalType = targetPixType;
          const isPixDifferent = driver.pix_key_type !== canonicalType || (driver.pix_key_value || driver.pix_key) !== canonicalVal;
          if (isPixDifferent) {
            const oldMasked = maskPixKey(driver.pix_key_type, driver.pix_key_value || driver.pix_key);
            const newMasked = maskPixKey(canonicalType, canonicalVal);
            setPayload.pix_key_type = canonicalType;
            setPayload.pix_key_value = canonicalVal;
            setPayload.pix_key = canonicalVal;
            auditEventsToInsert.push({
              driver_id: driverId,
              event_type: "DRIVER_PROFILE_UPDATED",
              actor_type: context.actor_type,
              actor_id: context.actor_id || null,
              field_changed: "pix",
              old_value: `${driver.pix_key_type}:${oldMasked}`,
              new_value: `${canonicalType}:${newMasked}`,
              details: JSON.stringify({
                old_pix_type: driver.pix_key_type,
                old_pix_value_masked: oldMasked,
                new_pix_type: canonicalType,
                new_pix_value_masked: newMasked
              })
            });
          }
        }
        if (Object.keys(setPayload).length === 1 && setPayload.updated_at) {
          return driver;
        }
        const updated = await db.update(drivers).set(setPayload).where(eq6(drivers.id, driverId)).returning();
        const updatedDriver = updated[0];
        for (const event of auditEventsToInsert) {
          await db.insert(driverEvents).values(event);
        }
        return updatedDriver;
      }
      async approveDriver(id) {
        const driver = await this.getDriverById(id);
        if (!driver) {
          throw new Error("DRIVER_NOT_FOUND");
        }
        if (driver.status === "ACTIVE") {
          return driver;
        }
        if (driver.status !== "PENDING") {
          throw new Error(`CANNOT_APPROVE_FROM_STATUS_${driver.status}`);
        }
        try {
          const updated = await db.update(drivers).set({
            status: "ACTIVE",
            updated_at: /* @__PURE__ */ new Date()
          }).where(eq6(drivers.id, id)).returning();
          const updatedDriver = updated[0];
          if (process.env.SQL_DB_NAME !== "cloud_sql_production_database") {
            try {
              await prodDb.update(drivers).set({
                status: "ACTIVE",
                updated_at: /* @__PURE__ */ new Date()
              }).where(eq6(drivers.id, id)).catch(() => {
              });
              await prodDb.insert(driverEvents).values({
                driver_id: id,
                event_type: "DRIVER_APPROVED"
              }).catch(() => {
              });
            } catch {
            }
          }
          await db.insert(driverEvents).values({
            driver_id: id,
            event_type: "DRIVER_APPROVED"
          });
          if (updatedDriver.telegram_chat_id && !updatedDriver.telegram_chat_id.startsWith("pending_")) {
            const msg = "\u2705 Cadastro aprovado.\n\nVoc\xEA agora est\xE1 habilitado para receber ofertas de entrega da Kantine.";
            await telegramBot.sendMessage(updatedDriver.telegram_chat_id, msg).catch(
              (e) => console.warn("[DriverService.approveDriver] Telegram notification notice:", e.message)
            );
          }
          return updatedDriver;
        } catch (err) {
          console.error(`[DriverService.approveDriver failed for #${id}]`, err);
          throw new Error(`Failed to approve driver #${id}`, { cause: err });
        }
      }
      async blockDriver(id) {
        const driver = await this.getDriverById(id);
        if (!driver) {
          throw new Error("DRIVER_NOT_FOUND");
        }
        if (driver.status === "BLOCKED") {
          return driver;
        }
        const wasActive = driver.status === "ACTIVE";
        try {
          const updated = await db.update(drivers).set({
            status: "BLOCKED",
            updated_at: /* @__PURE__ */ new Date()
          }).where(eq6(drivers.id, id)).returning();
          const updatedDriver = updated[0];
          await db.insert(driverEvents).values({
            driver_id: id,
            event_type: "DRIVER_BLOCKED"
          });
          if (wasActive) {
            const msg = "Seu cadastro de entregador n\xE3o est\xE1 ativo no momento.\n\nCaso tenha d\xFAvidas, entre em contato com a Kantine.";
            await telegramBot.sendMessage(updatedDriver.telegram_chat_id, msg);
          }
          return updatedDriver;
        } catch (err) {
          console.error(`[DriverService.blockDriver failed for #${id}]`, err);
          throw new Error(`Failed to block driver #${id}`, { cause: err });
        }
      }
      async reactivateDriver(id) {
        const driver = await this.getDriverById(id);
        if (!driver) {
          throw new Error("DRIVER_NOT_FOUND");
        }
        if (driver.status === "ACTIVE") {
          return driver;
        }
        if (driver.status !== "BLOCKED") {
          throw new Error(`CANNOT_REACTIVATE_FROM_STATUS_${driver.status}`);
        }
        try {
          const updated = await db.update(drivers).set({
            status: "ACTIVE",
            reactivation_requested: false,
            updated_at: /* @__PURE__ */ new Date()
          }).where(eq6(drivers.id, id)).returning();
          const updatedDriver = updated[0];
          await db.insert(driverEvents).values({
            driver_id: id,
            event_type: "DRIVER_REACTIVATED",
            actor_type: "ADMIN"
          });
          const msg = "\u2705 Seu cadastro de entregador foi reativado.\n\nVoc\xEA j\xE1 pode receber ofertas de entregas da Kantine.";
          await telegramBot.sendMessage(updatedDriver.telegram_chat_id, msg);
          return updatedDriver;
        } catch (err) {
          console.error(`[DriverService.reactivateDriver failed for #${id}]`, err);
          throw new Error(`Failed to reactivate driver #${id}`, { cause: err });
        }
      }
      /**
       * Driver submits reactivation request from Telegram when BLOCKED
       */
      async requestReactivation(id, reason) {
        const driver = await this.getDriverById(id);
        if (!driver) {
          throw new Error("DRIVER_NOT_FOUND");
        }
        if (driver.status !== "BLOCKED") {
          throw new Error(`CANNOT_REQUEST_REACTIVATION_FOR_STATUS_${driver.status}`);
        }
        const trimmedReason = (reason || "").trim();
        if (trimmedReason.length < 3) {
          throw new Error("INVALID_REASON: Justificativa de reativa\xE7\xE3o deve ter no m\xEDnimo 3 caracteres.");
        }
        try {
          const updated = await db.update(drivers).set({
            reactivation_requested: true,
            reactivation_requested_at: /* @__PURE__ */ new Date(),
            reactivation_reason: trimmedReason,
            updated_at: /* @__PURE__ */ new Date()
          }).where(eq6(drivers.id, id)).returning();
          const updatedDriver = updated[0];
          await db.insert(driverEvents).values({
            driver_id: id,
            event_type: "REACTIVATION_REQUESTED",
            actor_type: "DRIVER",
            actor_id: driver.telegram_user_id,
            details: trimmedReason
          });
          return updatedDriver;
        } catch (err) {
          console.error(`[DriverService.requestReactivation failed for #${id}]`, err);
          throw new Error(`Failed to request reactivation for driver #${id}`, { cause: err });
        }
      }
      /**
       * Admin rejects reactivation request
       */
      async rejectReactivation(id, rejectionReason, actorId) {
        const driver = await this.getDriverById(id);
        if (!driver) {
          throw new Error("DRIVER_NOT_FOUND");
        }
        const trimmed = (rejectionReason || "").trim() || "Solicita\xE7\xE3o de reativa\xE7\xE3o n\xE3o aprovada.";
        try {
          const updated = await db.update(drivers).set({
            reactivation_requested: false,
            updated_at: /* @__PURE__ */ new Date()
          }).where(eq6(drivers.id, id)).returning();
          const updatedDriver = updated[0];
          await db.insert(driverEvents).values({
            driver_id: id,
            event_type: "REACTIVATION_REJECTED",
            actor_type: "ADMIN",
            actor_id: actorId || null,
            details: trimmed
          });
          const msg = `\u274C *Solicita\xE7\xE3o de Reativa\xE7\xE3o N\xE3o Aprovada*

Sua solicita\xE7\xE3o de reativa\xE7\xE3o foi analisada pela administra\xE7\xE3o da Kantine.

\u2022 *Motivo informado:* ${escapeTelegramMarkdown(trimmed)}

Caso queira mais informa\xE7\xF5es, entre em contato com o suporte da Kantine.`;
          await telegramBot.sendMessage(updatedDriver.telegram_chat_id, msg);
          return updatedDriver;
        } catch (err) {
          console.error(`[DriverService.rejectReactivation failed for #${id}]`, err);
          throw new Error(`Failed to reject reactivation for driver #${id}`, { cause: err });
        }
      }
      /**
       * Admin excludes/archives driver with mandatory reason and historical memory
       */
      async excludeDriver(id, reason, actorId) {
        const driver = await this.getDriverById(id);
        if (!driver) {
          throw new Error("DRIVER_NOT_FOUND");
        }
        const trimmedReason = (reason || "").trim();
        if (trimmedReason.length < 3) {
          throw new Error("INVALID_REASON: Motivo de exclus\xE3o \xE9 obrigat\xF3rio (m\xEDnimo 3 caracteres).");
        }
        const newExclusionCount = (driver.exclusion_count || 0) + 1;
        try {
          const updated = await db.update(drivers).set({
            status: "EXCLUDED",
            is_excluded: true,
            excluded_at: /* @__PURE__ */ new Date(),
            exclusion_reason: trimmedReason,
            excluded_by: actorId || "ADMIN",
            previous_exclusion_reason: trimmedReason,
            exclusion_count: newExclusionCount,
            reactivation_requested: false,
            reinclusion_requested: false,
            updated_at: /* @__PURE__ */ new Date()
          }).where(eq6(drivers.id, id)).returning();
          const updatedDriver = updated[0];
          await db.insert(driverEvents).values({
            driver_id: id,
            event_type: "DRIVER_EXCLUDED",
            actor_type: "ADMIN",
            actor_id: actorId || null,
            details: JSON.stringify({
              reason: trimmedReason,
              exclusion_number: newExclusionCount,
              previous_status: driver.status
            })
          });
          const msg = `\u26A0\uFE0F *Cadastro Desativado \u2014 Kantine Entregas*

Seu cadastro de entregador foi desativado/exclu\xEDdo pela administra\xE7\xE3o.

\u2022 *Motivo registrado:* ${escapeTelegramMarkdown(trimmedReason)}

O seu processo foi zerado. Para retornar \xE0 equipe Kantine Entregas, ser\xE1 necess\xE1rio receber um novo convite e refazer o cadastro com dados atualizados (ve\xEDculo, telefone e chave PIX) para nova aprova\xE7\xE3o.`;
          await telegramBot.sendMessage(updatedDriver.telegram_chat_id, msg);
          return updatedDriver;
        } catch (err) {
          console.error(`[DriverService.excludeDriver failed for #${id}]`, err);
          throw new Error(`Failed to exclude driver #${id}`, { cause: err });
        }
      }
      /**
       * Excluded driver submits request for future reinclusion via Telegram
       */
      async requestReinclusion(id, reason) {
        const driver = await this.getDriverById(id);
        if (!driver) {
          throw new Error("DRIVER_NOT_FOUND");
        }
        if (driver.status !== "EXCLUDED" && !driver.is_excluded) {
          throw new Error(`CANNOT_REQUEST_REINCLUSION_FOR_STATUS_${driver.status}`);
        }
        const trimmedReason = (reason || "").trim();
        if (trimmedReason.length < 3) {
          throw new Error("INVALID_REASON: Justificativa de reinclus\xE3o deve ter no m\xEDnimo 3 caracteres.");
        }
        try {
          const updated = await db.update(drivers).set({
            reinclusion_requested: true,
            reinclusion_requested_at: /* @__PURE__ */ new Date(),
            reinclusion_reason: trimmedReason,
            updated_at: /* @__PURE__ */ new Date()
          }).where(eq6(drivers.id, id)).returning();
          const updatedDriver = updated[0];
          await db.insert(driverEvents).values({
            driver_id: id,
            event_type: "REINCLUSION_REQUESTED",
            actor_type: "DRIVER",
            actor_id: driver.telegram_user_id,
            details: trimmedReason
          });
          return updatedDriver;
        } catch (err) {
          console.error(`[DriverService.requestReinclusion failed for #${id}]`, err);
          throw new Error(`Failed to request reinclusion for driver #${id}`, { cause: err });
        }
      }
      /**
       * Admin approves reinclusion request: enforces that excluded drivers require a new invite and approval
       */
      async approveReinclusion(id, options, actorId) {
        const driver = await this.getDriverById(id);
        if (!driver) {
          throw new Error("DRIVER_NOT_FOUND");
        }
        if (driver.status === "EXCLUDED" || driver.is_excluded) {
          throw new Error(
            "EXCLUDED_DRIVER_REQUIRES_NEW_INVITE: Motoristas exclu\xEDdos t\xEAm o processo zerado e s\xF3 podem ser reinseridos atrav\xE9s de novo convite e aprova\xE7\xE3o (pois podem ter mudado de ve\xEDculo, telefone ou chave PIX)."
          );
        }
        return driver;
      }
      /**
       * Admin rejects reinclusion request
       */
      async rejectReinclusion(id, rejectionReason, actorId) {
        const driver = await this.getDriverById(id);
        if (!driver) {
          throw new Error("DRIVER_NOT_FOUND");
        }
        const trimmed = (rejectionReason || "").trim() || "Pedido de reinclus\xE3o n\xE3o aprovado.";
        try {
          const updated = await db.update(drivers).set({
            reinclusion_requested: false,
            updated_at: /* @__PURE__ */ new Date()
          }).where(eq6(drivers.id, id)).returning();
          const updatedDriver = updated[0];
          await db.insert(driverEvents).values({
            driver_id: id,
            event_type: "REINCLUSION_REJECTED",
            actor_type: "ADMIN",
            actor_id: actorId || null,
            details: trimmed
          });
          const msg = `\u274C *Pedido de Reinclus\xE3o N\xE3o Aprovado*

Seu pedido de reinclus\xE3o foi analisado pela administra\xE7\xE3o da Kantine.

\u2022 *Motivo informado:* ${escapeTelegramMarkdown(trimmed)}

Seu cadastro permanece desativado.`;
          await telegramBot.sendMessage(updatedDriver.telegram_chat_id, msg);
          return updatedDriver;
        } catch (err) {
          console.error(`[DriverService.rejectReinclusion failed for #${id}]`, err);
          throw new Error(`Failed to reject reinclusion for driver #${id}`, { cause: err });
        }
      }
      async getDriverEvents(driverId) {
        try {
          return await db.select().from(driverEvents).where(eq6(driverEvents.driver_id, driverId)).orderBy(desc4(driverEvents.timestamp));
        } catch (err) {
          console.error(`[DriverService.getDriverEvents failed for #${driverId}]`, err);
          throw new Error(`Failed to get events for driver #${driverId}`, { cause: err });
        }
      }
      checkEligibility(driver) {
        return canReceiveDeliveryOffers(driver);
      }
      async createDriverInvitation(data) {
        try {
          const randomPart = Math.random().toString(36).substring(2, 8);
          const timePart = Date.now().toString(36);
          const token = `inv_${timePart}_${randomPart}`;
          const inserted = await db.insert(driverInvitations).values({
            token,
            name: data.name?.trim() || null,
            phone: data.phone?.trim() || null,
            vehicle_type: data.vehicle_type || null,
            status: "PENDING",
            created_by: data.created_by || "ADMIN"
          }).returning();
          const inv = inserted[0];
          if (process.env.SQL_DB_NAME !== "cloud_sql_production_database") {
            try {
              await prodDb.insert(driverInvitations).values(inv).onConflictDoNothing().catch(() => {
              });
            } catch (e) {
              console.warn("[DriverService] Mirror invitation to prod warning:", e?.message);
            }
          }
          return inv;
        } catch (err) {
          console.error("[DriverService.createDriverInvitation failed]", err);
          throw new Error("Failed to create driver invitation", { cause: err });
        }
      }
      async getDriverInvitations() {
        try {
          const list = await db.select().from(driverInvitations).orderBy(desc4(driverInvitations.created_at));
          if (process.env.SQL_DB_NAME !== "cloud_sql_production_database") {
            try {
              const prodList = await prodDb.select().from(driverInvitations).orderBy(desc4(driverInvitations.created_at));
              const existingTokens = new Set(list.map((i) => i.token));
              for (const pi of prodList) {
                if (!existingTokens.has(pi.token)) {
                  list.push(pi);
                  await db.insert(driverInvitations).values(pi).onConflictDoNothing().catch(() => {
                  });
                }
              }
            } catch {
            }
          }
          return list;
        } catch (err) {
          console.error("[DriverService.getDriverInvitations failed]", err);
          throw new Error("Failed to retrieve driver invitations", { cause: err });
        }
      }
      async getInviteByToken(token) {
        try {
          const results = await db.select().from(driverInvitations).where(eq6(driverInvitations.token, token));
          if (results[0]) return results[0];
          if (process.env.SQL_DB_NAME !== "cloud_sql_production_database") {
            const prodResults = await prodDb.select().from(driverInvitations).where(eq6(driverInvitations.token, token));
            if (prodResults[0]) {
              try {
                await db.insert(driverInvitations).values(prodResults[0]).onConflictDoNothing().catch(() => {
                });
              } catch {
              }
              return prodResults[0];
            }
          }
          return null;
        } catch (err) {
          console.error(`[DriverService.getInviteByToken failed for ${token}]`, err);
          return null;
        }
      }
      async cancelDriverInvitation(id) {
        try {
          await db.update(driverInvitations).set({ status: "CANCELLED" }).where(eq6(driverInvitations.id, id));
          if (process.env.SQL_DB_NAME !== "cloud_sql_production_database") {
            await prodDb.update(driverInvitations).set({ status: "CANCELLED" }).where(eq6(driverInvitations.id, id)).catch(() => {
            });
          }
          return true;
        } catch (err) {
          console.error(`[DriverService.cancelDriverInvitation failed for #${id}]`, err);
          return false;
        }
      }
      /**
       * Directly convert an invitation into a registered driver record with PENDING status.
       * Enables admin to instantly bring invited drivers (like Evelyn) into the pending approval queue.
       */
      async convertInvitationToDriver(invitationId) {
        let invite = await db.select().from(driverInvitations).where(eq6(driverInvitations.id, invitationId)).then((r) => r[0]);
        if (!invite && process.env.SQL_DB_NAME !== "cloud_sql_production_database") {
          invite = await prodDb.select().from(driverInvitations).where(eq6(driverInvitations.id, invitationId)).then((r) => r[0]);
        }
        if (!invite) {
          throw new Error("INVITATION_NOT_FOUND");
        }
        if (invite.driver_id) {
          const existing = await this.getDriverById(invite.driver_id);
          if (existing) return existing;
        }
        const placeholderId = `pending_${invite.token}`;
        const cleanPhone = normalizeGeneralPhone(invite.phone || "34999999999");
        const validVehicle = invite.vehicle_type || "CAR";
        const existingPlaceholder = await this.getDriverByTelegramUserId(placeholderId);
        if (existingPlaceholder) return existingPlaceholder;
        const inserted = await db.insert(drivers).values({
          telegram_user_id: placeholderId,
          telegram_chat_id: placeholderId,
          name: invite.name?.trim() || "Motorista Convidado",
          phone: cleanPhone,
          vehicle_type: validVehicle,
          pix_key: cleanPhone,
          pix_key_type: "PHONE",
          pix_key_value: cleanPhone,
          status: "PENDING"
        }).returning();
        const newDriver = inserted[0];
        await db.update(driverInvitations).set({
          status: "COMPLETED",
          driver_id: newDriver.id,
          completed_at: /* @__PURE__ */ new Date()
        }).where(eq6(driverInvitations.id, invitationId));
        await db.insert(driverEvents).values({
          driver_id: newDriver.id,
          event_type: "DRIVER_REGISTERED",
          actor_type: "ADMIN",
          actor_id: invite.created_by || "ADMIN"
        });
        if (process.env.SQL_DB_NAME !== "cloud_sql_production_database") {
          try {
            await prodDb.insert(drivers).values(newDriver).onConflictDoNothing().catch(() => {
            });
            await prodDb.update(driverInvitations).set({
              status: "COMPLETED",
              driver_id: newDriver.id,
              completed_at: /* @__PURE__ */ new Date()
            }).where(eq6(driverInvitations.id, invitationId)).catch(() => {
            });
            await prodDb.insert(driverEvents).values({
              driver_id: newDriver.id,
              event_type: "DRIVER_REGISTERED",
              actor_type: "ADMIN",
              actor_id: invite.created_by || "ADMIN"
            }).catch(() => {
            });
          } catch (err) {
            console.warn("[convertInvitationToDriver] Prod mirror warning:", err?.message);
          }
        }
        return newDriver;
      }
      /**
       * Binds a pre-created or token-based pending driver to a real Telegram user ID & chat ID.
       */
      async bindPendingDriverToTelegram(token, telegramUserId, chatId) {
        try {
          const placeholderId = `pending_${token}`;
          let driver = await this.getDriverByTelegramUserId(placeholderId);
          if (!driver) {
            const inv = await this.getInviteByToken(token);
            if (inv && inv.driver_id) {
              driver = await this.getDriverById(inv.driver_id);
            }
          }
          if (driver) {
            const updated = await db.update(drivers).set({
              telegram_user_id: telegramUserId,
              telegram_chat_id: chatId,
              updated_at: /* @__PURE__ */ new Date()
            }).where(eq6(drivers.id, driver.id)).returning();
            const linked = updated[0] || driver;
            await db.update(driverInvitations).set({
              telegram_user_id: telegramUserId,
              status: "COMPLETED",
              completed_at: /* @__PURE__ */ new Date()
            }).where(eq6(driverInvitations.token, token));
            if (process.env.SQL_DB_NAME !== "cloud_sql_production_database") {
              try {
                await prodDb.update(drivers).set({
                  telegram_user_id: telegramUserId,
                  telegram_chat_id: chatId,
                  updated_at: /* @__PURE__ */ new Date()
                }).where(eq6(drivers.id, driver.id)).catch(() => {
                });
                await prodDb.update(driverInvitations).set({
                  telegram_user_id: telegramUserId,
                  status: "COMPLETED",
                  completed_at: /* @__PURE__ */ new Date()
                }).where(eq6(driverInvitations.token, token)).catch(() => {
                });
              } catch {
              }
            }
            return linked;
          }
          return null;
        } catch (err) {
          console.warn("[DriverService.bindPendingDriverToTelegram] Error:", err?.message);
          return null;
        }
      }
      /**
       * M4.1 PARTE A: Relatório de Auditoria de Veículos dos Motoristas de Indicação (Seção 7)
       */
      async getReferralVehicleAudit() {
        const referralsWithDrivers = await db.select({
          referral_id: driverReferrals.id,
          referred_name: driverReferrals.referred_name,
          referred_phone: driverReferrals.referred_phone,
          referred_by_driver_id: driverReferrals.referred_by_driver_id,
          resulting_driver_id: driverReferrals.resulting_driver_id,
          referral_created_at: driverReferrals.created_at
        }).from(driverReferrals).where(sql6`${driverReferrals.resulting_driver_id} IS NOT NULL`);
        if (referralsWithDrivers.length === 0) return [];
        const driverIds = Array.from(
          new Set(
            referralsWithDrivers.map((r) => r.resulting_driver_id).concat(referralsWithDrivers.map((r) => r.referred_by_driver_id))
          )
        );
        const driverRows = await db.select().from(drivers).where(sql6`${drivers.id} IN (${sql6.join(driverIds.map((id) => sql6`${id}`), sql6`, `)})`);
        const driverMap = /* @__PURE__ */ new Map();
        for (const d of driverRows) {
          driverMap.set(d.id, d);
        }
        return referralsWithDrivers.map((ref) => {
          const driver = driverMap.get(ref.resulting_driver_id);
          const indicator = driverMap.get(ref.referred_by_driver_id);
          const isPotentiallyAffected = driver?.vehicle_type === "CAR_SEDAN";
          return {
            driver_id: driver?.id || ref.resulting_driver_id,
            driver_name: driver?.name || ref.referred_name,
            driver_phone: driver?.phone || ref.referred_phone,
            vehicle_type: driver?.vehicle_type || "CAR_SEDAN",
            driver_status: driver?.status || "PENDING",
            driver_created_at: driver?.created_at || /* @__PURE__ */ new Date(),
            referral_id: ref.referral_id,
            referred_name: ref.referred_name,
            referred_phone: ref.referred_phone,
            referred_by_driver_id: ref.referred_by_driver_id,
            indicator_name: indicator?.name || null,
            indicator_vehicle_type: indicator?.vehicle_type || null,
            is_potentially_affected: isPotentiallyAffected,
            audit_note: isPotentiallyAffected ? "Origem: indica\xE7\xE3o. Ve\xEDculo atribu\xEDdo como CAR_SEDAN. Recomendada confer\xEAncia administrativa com o motorista." : "Ve\xEDculo compat\xEDvel ou com escolha expl\xEDcita."
          };
        });
      }
      /**
       * Resets all driver registrations, invitations, referrals, routes, and operational history
       * across both primary database and mirrored production database.
       * Also clears all Telegram bot cached sessions.
       */
      async resetAllDriversAndHistory() {
        const tables = [
          "driver_referral_events",
          "driver_referrals",
          "driver_events",
          "route_offer_dispatches",
          "delivery_offer_dispatches",
          "route_updates",
          "route_stops",
          "route_events",
          "routes",
          "delivery_events",
          "deliveries",
          "driver_invitations",
          "drivers"
        ];
        for (const t of tables) {
          await db.execute(sql6.raw(`DELETE FROM "${t}"`));
        }
        const sequences = [
          "drivers_id_seq",
          "driver_invitations_id_seq",
          "driver_events_id_seq",
          "driver_referrals_id_seq",
          "driver_referral_events_id_seq",
          "routes_id_seq",
          "route_stops_id_seq",
          "route_events_id_seq",
          "deliveries_id_seq",
          "delivery_events_id_seq"
        ];
        for (const seq of sequences) {
          try {
            await db.execute(sql6.raw(`SELECT setval('${seq}', 1, false)`));
          } catch {
          }
        }
        if (process.env.SQL_DB_NAME !== "cloud_sql_production_database") {
          try {
            for (const t of tables) {
              await prodDb.execute(sql6.raw(`DELETE FROM "${t}"`));
            }
            for (const seq of sequences) {
              try {
                await prodDb.execute(sql6.raw(`SELECT setval('${seq}', 1, false)`));
              } catch {
              }
            }
          } catch (err) {
            console.warn("[DriverService.resetAllDriversAndHistory] Prod DB reset error:", err.message);
          }
        }
        try {
          telegramBot.clearAllSessions();
        } catch (e) {
          console.warn("[DriverService.resetAllDriversAndHistory] Clear sessions error:", e.message);
        }
      }
    };
    driverService = new DriverService();
    try {
      telegramBot?.setDriverService(driverService);
    } catch {
    }
  }
});

// server.ts
import crypto2 from "crypto";
import express from "express";
import { createServer as createViteServer } from "vite";
import path3 from "path";
import fs3 from "fs";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

// scripts/generate_freight_excel.ts
import ExcelJS from "exceljs";
import path from "path";
import fs from "fs";

// src/server/freightEngine.ts
var PICKUP_PRESETS = {
  MATRIZ: {
    name: "Kantine Matriz",
    address: "Av. Get\xFAlio Vargas, 1846 \u2014 Uberl\xE2ndia/MG",
    neighborhood: "Daniel Fonseca",
    // Mesma localização que o Takeat usa para a loja (Av. Getúlio Vargas, 1846 — CEP 38400-329),
    // para o raio/taxa sair igual nos dois sistemas. A anterior (-18.92211, -48.28854) ficava ~520 m a leste.
    coords: { lat: -18.9239602, lng: -48.2931244 }
  },
  VINHEDOS: {
    name: "Kantine Vinhedos",
    address: "Rua Jos\xE9 Elias, 71 \u2014 Uberl\xE2ndia/MG",
    neighborhood: "Kara\xEDba",
    coords: { lat: -18.9542, lng: -48.2828 }
  }
};
function normalizeName(str) {
  return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
}
var UBERLANDIA_70_NEIGHBORHOODS = [
  // --- FAIXA R$ 18,00 (4 bairros) ---
  { name: "Daniel Fonseca", normalized: normalizeName("Daniel Fonseca"), carFee: 18, coords: { lat: -18.9228, lng: -48.2934 } },
  { name: "Tabajaras", normalized: normalizeName("Tabajaras"), carFee: 18, coords: { lat: -18.9261, lng: -48.2831 } },
  { name: "Martins", normalized: normalizeName("Martins"), carFee: 18, coords: { lat: -18.9142, lng: -48.2872 } },
  { name: "Jaragu\xE1", normalized: normalizeName("Jaragu\xE1"), carFee: 18, coords: { lat: -18.9312, lng: -48.3039 } },
  // --- FAIXA R$ 24,00 (28 bairros) ---
  { name: "Brasil", normalized: normalizeName("Brasil"), carFee: 24, coords: { lat: -18.9056, lng: -48.2778 } },
  { name: "Caraj\xE1s", normalized: normalizeName("Caraj\xE1s"), carFee: 24, coords: { lat: -18.9483, lng: -48.2589 } },
  { name: "Cazeca", normalized: normalizeName("Cazeca"), carFee: 24, coords: { lat: -18.9258, lng: -48.2711 } },
  { name: "Centro", normalized: normalizeName("Centro"), carFee: 24, coords: { lat: -18.9186, lng: -48.2772 } },
  { name: "Copacabana", normalized: normalizeName("Copacabana"), carFee: 24, coords: { lat: -18.9472, lng: -48.2961 } },
  { name: "Dona Zulmira", normalized: normalizeName("Dona Zulmira"), carFee: 24, coords: { lat: -18.9056, lng: -48.32 } },
  { name: "Fundinho", normalized: normalizeName("Fundinho"), carFee: 24, coords: { lat: -18.9222, lng: -48.2778 } },
  { name: "G\xE1vea", normalized: normalizeName("G\xE1vea"), carFee: 24, coords: { lat: -18.9611, lng: -48.2889 } },
  { name: "Grand Ville", normalized: normalizeName("Grand Ville"), carFee: 24, coords: { lat: -18.9189, lng: -48.2361 } },
  { name: "Jardim Bot\xE2nico", normalized: normalizeName("Jardim Bot\xE2nico"), carFee: 24, coords: { lat: -18.9667, lng: -48.2556 } },
  { name: "Jardim Kara\xEDba", normalized: normalizeName("Jardim Kara\xEDba"), carFee: 24, coords: { lat: -18.95, lng: -48.2889 } },
  { name: "Jardim Patr\xEDcia", normalized: normalizeName("Jardim Patr\xEDcia"), carFee: 24, coords: { lat: -18.9111, lng: -48.3333 } },
  { name: "Lagoinha", normalized: normalizeName("Lagoinha"), carFee: 24, coords: { lat: -18.9444, lng: -48.25 } },
  { name: "L\xEDdice", normalized: normalizeName("L\xEDdice"), carFee: 24, coords: { lat: -18.9278, lng: -48.2722 } },
  { name: "Luizote de Freitas", normalized: normalizeName("Luizote de Freitas"), carFee: 24, coords: { lat: -18.9111, lng: -48.3444 } },
  { name: "Morada da Colina", normalized: normalizeName("Morada da Colina"), carFee: 24, coords: { lat: -18.95, lng: -48.2778 } },
  { name: "Novo Mundo", normalized: normalizeName("Novo Mundo"), carFee: 24, coords: { lat: -18.9167, lng: -48.2222 } },
  { name: "Nossa Senhora Aparecida", normalized: normalizeName("Nossa Senhora Aparecida"), carFee: 24, coords: { lat: -18.9111, lng: -48.2667 } },
  { name: "Osvaldo Rezende", normalized: normalizeName("Osvaldo Rezende"), carFee: 24, coords: { lat: -18.9167, lng: -48.2944 } },
  { name: "Patrim\xF4nio", normalized: normalizeName("Patrim\xF4nio"), carFee: 24, coords: { lat: -18.9389, lng: -48.2833 } },
  { name: "Planalto", normalized: normalizeName("Planalto"), carFee: 24, coords: { lat: -18.9333, lng: -48.3333 } },
  { name: "Presidente Roosevelt", normalized: normalizeName("Presidente Roosevelt"), carFee: 24, coords: { lat: -18.8889, lng: -48.2889 } },
  { name: "Roosevelt", normalized: normalizeName("Roosevelt"), carFee: 24, coords: { lat: -18.8889, lng: -48.2889 } },
  { name: "Santa Maria", normalized: normalizeName("Santa Maria"), carFee: 24, coords: { lat: -18.9333, lng: -48.2611 } },
  { name: "Santa M\xF4nica", normalized: normalizeName("Santa M\xF4nica"), carFee: 24, coords: { lat: -18.9167, lng: -48.2444 } },
  { name: "Saraiva", normalized: normalizeName("Saraiva"), carFee: 24, coords: { lat: -18.9306, lng: -48.2667 } },
  { name: "Tibery", normalized: normalizeName("Tibery"), carFee: 24, coords: { lat: -18.9056, lng: -48.25 } },
  { name: "Tubalina", normalized: normalizeName("Tubalina"), carFee: 24, coords: { lat: -18.9333, lng: -48.3056 } },
  { name: "Vigilato Pereira", normalized: normalizeName("Vigilato Pereira"), carFee: 24, coords: { lat: -18.9389, lng: -48.2667 } },
  // --- FAIXA R$ 30,00 (38 bairros) ---
  { name: "Aclima\xE7\xE3o", normalized: normalizeName("Aclima\xE7\xE3o"), carFee: 30, coords: { lat: -18.8944, lng: -48.2278 } },
  { name: "Alto Umuarama", normalized: normalizeName("Alto Umuarama"), carFee: 30, coords: { lat: -18.8833, lng: -48.2444 } },
  { name: "Alvorada", normalized: normalizeName("Alvorada"), carFee: 30, coords: { lat: -18.8889, lng: -48.3222 } },
  { name: "Cust\xF3dio Pereira", normalized: normalizeName("Cust\xF3dio Pereira"), carFee: 30, coords: { lat: -18.8944, lng: -48.2556 } },
  { name: "Distrito Industrial", normalized: normalizeName("Distrito Industrial"), carFee: 30, coords: { lat: -18.8556, lng: -48.2778 } },
  { name: "Granja Marileusa", normalized: normalizeName("Granja Marileusa"), carFee: 30, coords: { lat: -18.8667, lng: -48.2278 } },
  { name: "Guarani", normalized: normalizeName("Guarani"), carFee: 30, coords: { lat: -18.9444, lng: -48.3389 } },
  { name: "Industrial", normalized: normalizeName("Industrial"), carFee: 30, coords: { lat: -18.8667, lng: -48.2889 } },
  { name: "Jardim Am\xE9rica", normalized: normalizeName("Jardim Am\xE9rica"), carFee: 30, coords: { lat: -18.9389, lng: -48.2333 } },
  { name: "Jardim Bras\xEDlia", normalized: normalizeName("Jardim Bras\xEDlia"), carFee: 30, coords: { lat: -18.8889, lng: -48.3056 } },
  { name: "Jardim Bras\xEDlia II", normalized: normalizeName("Jardim Bras\xEDlia II"), carFee: 30, coords: { lat: -18.8833, lng: -48.3083 } },
  { name: "Jardim das Ac\xE1cias", normalized: normalizeName("Jardim das Ac\xE1cias"), carFee: 30, coords: { lat: -18.9444, lng: -48.3278 } },
  { name: "Jardim das Palmeiras", normalized: normalizeName("Jardim das Palmeiras"), carFee: 30, coords: { lat: -18.9444, lng: -48.3167 } },
  { name: "Jardim Europa", normalized: normalizeName("Jardim Europa"), carFee: 30, coords: { lat: -18.9556, lng: -48.3111 } },
  { name: "Jardim Holanda", normalized: normalizeName("Jardim Holanda"), carFee: 30, coords: { lat: -18.9556, lng: -48.3333 } },
  { name: "Jardim Inconfid\xEAncia", normalized: normalizeName("Jardim Inconfid\xEAncia"), carFee: 30, coords: { lat: -18.9333, lng: -48.2444 } },
  { name: "Mansour", normalized: normalizeName("Mansour"), carFee: 30, coords: { lat: -18.9167, lng: -48.3556 } },
  { name: "Maravilha", normalized: normalizeName("Maravilha"), carFee: 30, coords: { lat: -18.8833, lng: -48.2722 } },
  { name: "Marta Helena", normalized: normalizeName("Marta Helena"), carFee: 30, coords: { lat: -18.8944, lng: -48.2944 } },
  { name: "Minas Gerais", normalized: normalizeName("Minas Gerais"), carFee: 30, coords: { lat: -18.8778, lng: -48.2833 } },
  { name: "Morada dos P\xE1ssaros", normalized: normalizeName("Morada dos P\xE1ssaros"), carFee: 30, coords: { lat: -18.9222, lng: -48.2222 } },
  { name: "Morumbi", normalized: normalizeName("Morumbi"), carFee: 30, coords: { lat: -18.9278, lng: -48.2111 } },
  { name: "Nova Uberl\xE2ndia", normalized: normalizeName("Nova Uberl\xE2ndia"), carFee: 30, coords: { lat: -18.95, lng: -48.3056 } },
  { name: "Nossa Senhora das Gra\xE7as", normalized: normalizeName("Nossa Senhora das Gra\xE7as"), carFee: 30, coords: { lat: -18.8833, lng: -48.2889 } },
  { name: "Pacaembu", normalized: normalizeName("Pacaembu"), carFee: 30, coords: { lat: -18.8889, lng: -48.2611 } },
  { name: "Portal do Vale", normalized: normalizeName("Portal do Vale"), carFee: 30, coords: { lat: -18.9111, lng: -48.2 } },
  { name: "Residencial Integra\xE7\xE3o", normalized: normalizeName("Residencial Integra\xE7\xE3o"), carFee: 30, coords: { lat: -18.9389, lng: -48.2056 } },
  { name: "Residencial Gramado", normalized: normalizeName("Residencial Gramado"), carFee: 30, coords: { lat: -18.9556, lng: -48.25 } },
  { name: "Santa Luzia", normalized: normalizeName("Santa Luzia"), carFee: 30, coords: { lat: -18.9556, lng: -48.2667 } },
  { name: "Santa Rosa", normalized: normalizeName("Santa Rosa"), carFee: 30, coords: { lat: -18.8778, lng: -48.3 } },
  { name: "S\xE3o Jorge", normalized: normalizeName("S\xE3o Jorge"), carFee: 30, coords: { lat: -18.9556, lng: -48.2389 } },
  { name: "S\xE3o Jos\xE9", normalized: normalizeName("S\xE3o Jos\xE9"), carFee: 30, coords: { lat: -18.8833, lng: -48.2667 } },
  { name: "Segismundo Pereira", normalized: normalizeName("Segismundo Pereira"), carFee: 30, coords: { lat: -18.9222, lng: -48.2389 } },
  { name: "Shopping Park", normalized: normalizeName("Shopping Park"), carFee: 30, coords: { lat: -18.9778, lng: -48.2778 } },
  { name: "Taiaman", normalized: normalizeName("Taiaman"), carFee: 30, coords: { lat: -18.8944, lng: -48.3333 } },
  { name: "Tocantins", normalized: normalizeName("Tocantins"), carFee: 30, coords: { lat: -18.9056, lng: -48.3556 } },
  { name: "Umuarama", normalized: normalizeName("Umuarama"), carFee: 30, coords: { lat: -18.8944, lng: -48.2444 } }
];
var MOTO_RADIUS_TARIFF_TABLE = {
  1: 10.5,
  2: 12,
  3: 13,
  4: 14,
  5: 15.5,
  6: 17,
  7: 18,
  8: 19,
  9: 20,
  10: 21,
  11: 22,
  12: 23,
  13: 24,
  14: 25,
  15: 26,
  16: 27,
  17: 28,
  18: 29,
  19: 30,
  20: 31
};
var CAR_RADIUS_TARIFF_TABLE = {
  1: 20,
  2: 23,
  3: 25,
  4: 27,
  5: 29,
  6: 30,
  7: 31,
  8: 32,
  9: 33,
  10: 33,
  11: 38,
  12: 38,
  13: 38,
  14: 38,
  15: 38,
  16: 44,
  17: 44,
  18: 44,
  19: 44,
  20: 44
};
var DEFAULT_FREIGHT_PARAMETERS = {
  horizontalCondoMultiplier: 0.2,
  groupingFactor: 0.7,
  driverShareRate: 0.9,
  kantineShareRate: 0.1,
  maxMotoRadiusKm: 20
};
function calculateHaversineDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
function findNeighborhoodRecord(name) {
  if (!name) return null;
  const normalized = normalizeName(name);
  if (!normalized) return null;
  const exact = UBERLANDIA_70_NEIGHBORHOODS.find((n) => n.normalized === normalized);
  if (exact) return exact;
  const partial = UBERLANDIA_70_NEIGHBORHOODS.find(
    (n) => n.normalized.includes(normalized) || normalized.includes(n.normalized)
  );
  return partial || null;
}
function getMotoBaseTariff(pickupCoords, dropoffCoords) {
  const dist = calculateHaversineDistanceKm(
    pickupCoords.lat,
    pickupCoords.lng,
    dropoffCoords.lat,
    dropoffCoords.lng
  );
  let roundedRadius = Math.ceil(dist);
  if (roundedRadius < 1) roundedRadius = 1;
  if (roundedRadius > 20) {
    return {
      exactDistanceKm: Math.round(dist * 100) / 100,
      roundedRadiusKm: roundedRadius,
      fee: null,
      isConsultationRequired: true
    };
  }
  const fee = MOTO_RADIUS_TARIFF_TABLE[roundedRadius] || null;
  return {
    exactDistanceKm: Math.round(dist * 100) / 100,
    roundedRadiusKm: roundedRadius,
    fee,
    isConsultationRequired: false
  };
}
function getCarBaseTariffByRadius(pickupCoords, dropoffCoords) {
  const dist = calculateHaversineDistanceKm(
    pickupCoords.lat,
    pickupCoords.lng,
    dropoffCoords.lat,
    dropoffCoords.lng
  );
  let roundedRadius = Math.ceil(dist);
  if (roundedRadius < 1) roundedRadius = 1;
  if (roundedRadius > 20) {
    return {
      exactDistanceKm: Math.round(dist * 100) / 100,
      roundedRadiusKm: roundedRadius,
      fee: null,
      tierLabel: "Acima de 20 km (> 20 km)",
      isConsultationRequired: true
    };
  }
  let fee = 33;
  let tierLabel = `At\xE9 ${roundedRadius} km`;
  if (roundedRadius <= 10) {
    fee = CAR_RADIUS_TARIFF_TABLE[roundedRadius] || 33;
    tierLabel = `At\xE9 ${roundedRadius} km`;
  } else if (roundedRadius <= 15) {
    fee = 38;
    tierLabel = "10 a 15 km";
  } else {
    fee = 44;
    tierLabel = "15 a 20 km";
  }
  return {
    exactDistanceKm: Math.round(dist * 100) / 100,
    roundedRadiusKm: roundedRadius,
    fee,
    tierLabel,
    isConsultationRequired: false
  };
}
function calculateRoutePricing(modality, origin, stops, params = DEFAULT_FREIGHT_PARAMETERS) {
  const originCoords = origin.coords || PICKUP_PRESETS.MATRIZ.coords;
  const totalStops = stops.length;
  const isGrouped = totalStops >= 2;
  const groupingFactor = isGrouped ? params.groupingFactor : 1;
  let hasManualPending = false;
  const stopsResults = [];
  for (const stop of stops) {
    let baseTariff = 0;
    let distanceKm;
    let roundedRadiusKm;
    let requiresManual = false;
    let warning;
    if (stop.manual_base_fee && stop.manual_base_fee > 0) {
      baseTariff = stop.manual_base_fee;
      warning = "Tarifa base personalizada/manual informada pelo operador.";
    } else {
      let dropCoords = stop.dropoff_coords;
      if (!dropCoords) {
        const found = findNeighborhoodRecord(stop.destination_neighborhood);
        if (found) dropCoords = found.coords;
      }
      if (dropCoords) {
        if (modality === "CAR") {
          const carInfo = getCarBaseTariffByRadius(originCoords, dropCoords);
          distanceKm = carInfo.exactDistanceKm;
          roundedRadiusKm = carInfo.roundedRadiusKm;
          if (carInfo.isConsultationRequired || carInfo.fee === null) {
            if (stop.manual_base_fee && stop.manual_base_fee > 0) {
              baseTariff = stop.manual_base_fee;
              warning = `Raio superior a 20 km (${carInfo.exactDistanceKm} km). Valor sob consulta confirmado.`;
            } else {
              baseTariff = 44;
              requiresManual = true;
              hasManualPending = true;
              warning = `Dist\xE2ncia de Carro (${carInfo.exactDistanceKm} km) excede raio m\xE1ximo de 20 km: SOB CONSULTA.`;
            }
          } else {
            baseTariff = carInfo.fee;
          }
        } else {
          const motoInfo = getMotoBaseTariff(originCoords, dropCoords);
          distanceKm = motoInfo.exactDistanceKm;
          roundedRadiusKm = motoInfo.roundedRadiusKm;
          if (motoInfo.isConsultationRequired || motoInfo.fee === null) {
            if (stop.manual_base_fee && stop.manual_base_fee > 0) {
              baseTariff = stop.manual_base_fee;
              warning = `Raio superior a 20 km (${motoInfo.exactDistanceKm} km). Valor sob consulta confirmado.`;
            } else {
              baseTariff = 31;
              requiresManual = true;
              hasManualPending = true;
              warning = `Dist\xE2ncia (${motoInfo.exactDistanceKm} km) excede raio m\xE1ximo de 20 km: SOB CONSULTA.`;
            }
          } else {
            baseTariff = motoInfo.fee;
          }
        }
      } else if (stop.manual_base_fee && stop.manual_base_fee > 0) {
        baseTariff = stop.manual_base_fee;
        warning = "Coordenadas n\xE3o dispon\xEDveis. Tarifa manual informada.";
      } else {
        baseTariff = modality === "CAR" ? 29 : 15.5;
        requiresManual = true;
        hasManualPending = true;
        warning = "Coordenadas do destino n\xE3o identificadas para c\xE1lculo de raio. Confirma\xE7\xE3o necess\xE1ria.";
      }
    }
    let baseTariffWithCondo = baseTariff;
    const isCondoApplied = Boolean(stop.is_horizontal_condo && modality === "CAR");
    if (isCondoApplied) {
      baseTariffWithCondo = Math.round(baseTariff * (1 + params.horizontalCondoMultiplier) * 100) / 100;
    }
    const finalStopTariff = Math.round(baseTariffWithCondo * groupingFactor * 100) / 100;
    stopsResults.push({
      sequence: stop.sequence,
      destination_address: stop.destination_address,
      destination_neighborhood: stop.destination_neighborhood,
      is_horizontal_condo: isCondoApplied,
      base_tariff: baseTariff,
      base_tariff_with_condo: baseTariffWithCondo,
      grouping_factor_applied: groupingFactor,
      final_stop_tariff: finalStopTariff,
      distance_km: distanceKm,
      rounded_radius_km: roundedRadiusKm,
      requires_manual_confirmation: requiresManual,
      warning
    });
  }
  const routeOperationalTotal = Math.round(stopsResults.reduce((acc, s) => acc + s.final_stop_tariff, 0) * 100) / 100;
  const driverRemuneration = Math.round(routeOperationalTotal * params.driverShareRate * 100) / 100;
  const kantineAdministration = Math.round((routeOperationalTotal - driverRemuneration) * 100) / 100;
  const googleMapsUrl = buildGoogleMapsRouteUrl(origin.address, stops);
  return {
    vehicle_modality: modality,
    origin_name: origin.name,
    origin_address: origin.address,
    origin_coords: originCoords,
    total_stops: totalStops,
    stops: stopsResults,
    route_operational_total: routeOperationalTotal,
    driver_remuneration: driverRemuneration,
    kantine_administration: kantineAdministration,
    is_grouped: isGrouped,
    has_manual_pending: hasManualPending,
    google_maps_url: googleMapsUrl
  };
}
function buildGoogleMapsRouteUrl(originAddress, stops) {
  if (!originAddress || !stops || stops.length === 0) return null;
  const validStops = stops.filter((s) => s.destination_address && s.destination_address.trim().length > 0).sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
  if (validStops.length === 0) return null;
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("origin", originAddress.trim());
  url.searchParams.set("travelmode", "driving");
  if (validStops.length === 1) {
    url.searchParams.set("destination", validStops[0].destination_address.trim());
  } else {
    const waypoints = validStops.slice(0, validStops.length - 1);
    const lastStop = validStops[validStops.length - 1];
    url.searchParams.set(
      "waypoints",
      waypoints.map((w) => w.destination_address.trim()).join("|")
    );
    url.searchParams.set("destination", lastStop.destination_address.trim());
  }
  return url.toString();
}
function generateWhatsAppProposalMessage(data) {
  const modalityLabel = data.modality === "MOTO" ? "Moto" : "Carro";
  const feeFormatted = data.driverFee.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
  const stopsListText = data.stops.map(
    (s, idx) => `${idx + 1}. ${s.destination_address}${s.destination_neighborhood ? ` \u2014 ${s.destination_neighborhood}` : ""}`
  ).join("\n");
  const mapsText = data.googleMapsUrl || "Link gerado na confirma\xE7\xE3o";
  const obsText = data.observations?.trim() ? data.observations.trim() : "Nenhuma";
  return `KANTINE \u2014 PROPOSTA DE ENTREGA

Modalidade: ${modalityLabel}

Coleta: ${data.originNameOrAddress}

Entregas: ${data.stops.length}

Paradas:
${stopsListText}

Valor proposto ao entregador: ${feeFormatted}

Google Maps: ${mapsText}

Observa\xE7\xF5es: ${obsText}

Aceita realizar esta rota?`;
}

// src/shared/freightNeighborhoods.ts
var UBERLANDIA_ADDITIONAL_NEIGHBORHOODS = [
  // --- ZONA CENTRAL / PERICENTRAL ---
  {
    name: "Bom Jesus",
    zone: "Central",
    carFee: 24,
    coords: { lat: -18.9095, lng: -48.2815 },
    referenceRationale: "Bairro central tradicional cont\xEDguo a Martins, Brasil e Centro (mesma faixa de R$ 24,00)."
  },
  // --- ZONA SUL ---
  {
    name: "Cidade Jardim",
    zone: "Sul",
    carFee: 24,
    coords: { lat: -18.9405, lng: -48.2985 },
    referenceRationale: "\xC1rea nobre cont\xEDgua a Tubalina, Patrim\xF4nio e Copacabana (todos R$ 24,00)."
  },
  {
    name: "Kara\xEDba (Bairro Vinhedos)",
    zone: "Sul",
    carFee: 24,
    coords: { lat: -18.9542, lng: -48.2828 },
    referenceRationale: "Local da unidade Kantine Vinhedos. Vizinho direto a Morada da Colina e Jardim Kara\xEDba."
  },
  {
    name: "Granada",
    zone: "Sul",
    carFee: 24,
    coords: { lat: -18.9502, lng: -48.252 },
    referenceRationale: "Bairro tradicional da Zona Sul situado entre Caraj\xE1s, S\xE3o Jorge e Santa Luzia."
  },
  {
    name: "Laranjeiras",
    zone: "Sul",
    carFee: 24,
    coords: { lat: -18.9645, lng: -48.271 },
    referenceRationale: "Zona Sul residencial entre Santa Luzia e Shopping Park, na mesma faixa e raio vi\xE1rio."
  },
  {
    name: "Jardim Sul",
    zone: "Sul",
    carFee: 24,
    coords: { lat: -18.972, lng: -48.2915 },
    referenceRationale: "Vetor de expans\xE3o sul de condom\xEDnios fechados, continua\xE7\xE3o direta da G\xE1vea."
  },
  {
    name: "Pampulha",
    zone: "Sul",
    carFee: 24,
    coords: { lat: -18.928, lng: -48.248 },
    referenceRationale: "Bairro residencial e universit\xE1rio (UFU Campus Educa\xE7\xE3o F\xEDsica), vizinho a Santa M\xF4nica."
  },
  {
    name: "G\xE1vea Sul / Paradiso",
    zone: "Sul",
    carFee: 30,
    coords: { lat: -18.969, lng: -48.282 },
    referenceRationale: "Loteamentos e condom\xEDnios ao sul da G\xE1vea, na faixa de expans\xE3o perif\xE9rica sul."
  },
  {
    name: "San Marino / Terra Branca",
    zone: "Sul",
    carFee: 30,
    coords: { lat: -18.978, lng: -48.295 },
    referenceRationale: "Setor sul adjacente a Shopping Park e Jardim Sul."
  },
  {
    name: "Ch\xE1caras Panorama",
    zone: "Sul",
    carFee: 30,
    coords: { lat: -18.971, lng: -48.308 },
    referenceRationale: "Extens\xE3o sudoeste de ch\xE1caras e condom\xEDnios, vizinho a Nova Uberl\xE2ndia."
  },
  {
    name: "Ch\xE1caras Douradinho",
    zone: "Periurbana / Rural",
    carFee: 40,
    coords: { lat: -18.989, lng: -48.335 },
    referenceRationale: "Regi\xE3o de ch\xE1caras estruturadas ao sudoeste, acesso rodovi\xE1rio/estrada vicinal."
  },
  {
    name: "Ch\xE1caras Rancho Alegre",
    zone: "Periurbana / Rural",
    carFee: 40,
    coords: { lat: -18.978, lng: -48.225 },
    referenceRationale: "\xC1rea de ch\xE1caras e s\xEDtios de eventos na sa\xEDda sudeste al\xE9m do S\xE3o Jorge."
  },
  // --- ZONA LESTE ---
  {
    name: "Dom Almir",
    zone: "Leste",
    carFee: 30,
    coords: { lat: -18.932, lng: -48.198 },
    referenceRationale: "Grande polo residencial da Zona Leste, cont\xEDguo ao Morumbi e Residencial Integra\xE7\xE3o (R$ 30,00)."
  },
  {
    name: "S\xE3o Francisco",
    zone: "Leste",
    carFee: 30,
    coords: { lat: -18.937, lng: -48.192 },
    referenceRationale: "Adjacente ao Dom Almir e Morumbi, mesma dist\xE2ncia e malha vi\xE1ria de R$ 30,00."
  },
  {
    name: "Joana D'Arc",
    zone: "Leste",
    carFee: 30,
    coords: { lat: -18.925, lng: -48.195 },
    referenceRationale: "Zona Leste cont\xEDguo ao Morumbi e Dom Almir."
  },
  {
    name: "Celebridade",
    zone: "Leste",
    carFee: 30,
    coords: { lat: -18.934, lng: -48.188 },
    referenceRationale: "Extens\xE3o residencial leste cont\xEDgua a S\xE3o Francisco e Dom Almir."
  },
  {
    name: "Prosperidade",
    zone: "Leste",
    carFee: 30,
    coords: { lat: -18.939, lng: -48.186 },
    referenceRationale: "Extens\xE3o leste adjacente a Dom Almir e Solidariedade."
  },
  {
    name: "Alvino Silva",
    zone: "Leste",
    carFee: 30,
    coords: { lat: -18.931, lng: -48.185 },
    referenceRationale: "Adjacente a Dom Almir e Morumbi."
  },
  {
    name: "Solidariedade",
    zone: "Leste",
    carFee: 30,
    coords: { lat: -18.943, lng: -48.182 },
    referenceRationale: "Loteamento residencial leste cont\xEDguo ao Dom Almir e Prosperidade."
  },
  {
    name: "Jardim Sucupira",
    zone: "Leste",
    carFee: 30,
    coords: { lat: -18.919, lng: -48.228 },
    referenceRationale: "Adjacente ao Segismundo Pereira e Santa M\xF4nica."
  },
  {
    name: "Ipanema",
    zone: "Leste",
    carFee: 30,
    coords: { lat: -18.898, lng: -48.218 },
    referenceRationale: "Zona Leste/Norte, cont\xEDguo ao Aclima\xE7\xE3o e Granja Marileusa (ambos R$ 30,00)."
  },
  {
    name: "Mans\xF5es Aeroporto",
    zone: "Leste",
    carFee: 30,
    coords: { lat: -18.891, lng: -48.212 },
    referenceRationale: "\xC1rea residencial pr\xF3xima ao Aeroporto C\xE9sar Bombonato e Granja Marileusa."
  },
  {
    name: "Ch\xE1caras Camping Clube",
    zone: "Periurbana / Rural",
    carFee: 45,
    coords: { lat: -18.912, lng: -48.165 },
    referenceRationale: "Setor de ch\xE1caras e lazer na sa\xEDda para Arax\xE1 (BR-452), ~13 km de raio."
  },
  // --- ZONA OESTE ---
  {
    name: "Ch\xE1caras Tubalina",
    zone: "Oeste",
    carFee: 24,
    coords: { lat: -18.942, lng: -48.318 },
    referenceRationale: "Continua\xE7\xE3o direta do bairro Tubalina e Jardim das Palmeiras."
  },
  {
    name: "Morada do Sol",
    zone: "Oeste",
    carFee: 24,
    coords: { lat: -18.921, lng: -48.341 },
    referenceRationale: "Situado entre Luizote de Freitas e Jardim Patr\xEDcia."
  },
  {
    name: "Santo In\xE1cio",
    zone: "Oeste",
    carFee: 24,
    coords: { lat: -18.918, lng: -48.349 },
    referenceRationale: "Adjacente a Mansour e Luizote de Freitas."
  },
  {
    name: "Jardim Cana\xE3",
    zone: "Oeste",
    carFee: 24,
    coords: { lat: -18.928, lng: -48.352 },
    referenceRationale: "Adjacente a Mansour e Planalto."
  },
  {
    name: "Jardim C\xE9lia",
    zone: "Oeste",
    carFee: 30,
    coords: { lat: -18.918, lng: -48.368 },
    referenceRationale: "Bairro em forte expans\xE3o a oeste de Planalto e Luizote, mesma faixa de Mansour/Tocantins."
  },
  {
    name: "Morada Nova",
    zone: "Oeste",
    carFee: 35,
    coords: { lat: -18.915, lng: -48.389 },
    referenceRationale: "Grande bairro residencial a oeste (>10.5 km da Matriz). Sugest\xE3o R$ 35,00 por quilometragem ampliada."
  },
  {
    name: "Residencial Pequis",
    zone: "Oeste",
    carFee: 35,
    coords: { lat: -18.902, lng: -48.385 },
    referenceRationale: "Bairro planejado na extremidade oeste al\xE9m do Tocantins (~10.5 km da Matriz)."
  },
  {
    name: "Monte Hebron",
    zone: "Oeste",
    carFee: 38,
    coords: { lat: -18.895, lng: -48.398 },
    referenceRationale: "Conjunto habitacional na divisa oeste al\xE9m do Pequis (~12 km de raio)."
  },
  // --- ZONA NORTE ---
  {
    name: "Cruzeiro do Sul",
    zone: "Norte",
    carFee: 24,
    coords: { lat: -18.895, lng: -48.282 },
    referenceRationale: "Bairro residencial na Zona Norte, ao lado de Presidente Roosevelt e Marta Helena."
  },
  {
    name: "Liberdade",
    zone: "Norte",
    carFee: 24,
    coords: { lat: -18.892, lng: -48.301 },
    referenceRationale: "Bairro residencial adjacente a Jardim Bras\xEDlia e Dona Zulmira."
  },
  {
    name: "S\xE3o Lucas",
    zone: "Norte",
    carFee: 30,
    coords: { lat: -18.871, lng: -48.279 },
    referenceRationale: "Adjacente aos bairros Minas Gerais e Distrito Industrial (ambos R$ 30,00)."
  },
  {
    name: "Vale do Parana\xEDba",
    zone: "Norte",
    carFee: 30,
    coords: { lat: -18.868, lng: -48.269 },
    referenceRationale: "Zona Norte, vizinho a Maravilha e S\xE3o Jos\xE9."
  },
  {
    name: "Distrito Industrial II",
    zone: "Norte",
    carFee: 30,
    coords: { lat: -18.839, lng: -48.271 },
    referenceRationale: "Expans\xE3o norte do Distrito Industrial."
  },
  // --- DISTRITOS MUNICIPAIS (FORA DO PERÍMETRO URBANO) ---
  {
    name: "Cruzeiro dos Peixotos (Distrito)",
    zone: "Distrito",
    carFee: 60,
    coords: { lat: -18.775, lng: -48.375 },
    referenceRationale: "Distrito municipal a noroeste via BR-365 (~18.5 km). Tarifa sugerida para atendimento rodovi\xE1rio."
  },
  {
    name: "Martin\xE9sia (Distrito)",
    zone: "Distrito",
    carFee: 75,
    coords: { lat: -18.725, lng: -48.225 },
    referenceRationale: "Distrito municipal rural a norte via BR-050 (~23 km). Tarifa especial sob consulta."
  },
  {
    name: "Miraporanga (Distrito)",
    zone: "Distrito",
    carFee: 80,
    coords: { lat: -19.067, lng: -48.45 },
    referenceRationale: "Distrito municipal a sudoeste (~22 km). Tarifa especial sob consulta."
  },
  {
    name: "Tapuirama (Distrito)",
    zone: "Distrito",
    carFee: 90,
    coords: { lat: -19.083, lng: -48.067 },
    referenceRationale: "Distrito municipal a sudeste via BR-452 (~28.5 km). Tarifa especial sob consulta."
  }
];
function getZoneForOriginalNeighborhood(name) {
  const central = ["Daniel Fonseca", "Tabajaras", "Martins", "Fundinho", "Centro", "Cazeca", "L\xEDdice", "Osvaldo Rezende", "Nossa Senhora Aparecida", "Brasil"];
  const sul = ["Caraj\xE1s", "Copacabana", "G\xE1vea", "Jardim Bot\xE2nico", "Jardim Kara\xEDba", "Lagoinha", "Morada da Colina", "Patrim\xF4nio", "Santa Maria", "Saraiva", "Tubalina", "Vigilato Pereira", "Guarani", "Jardim das Ac\xE1cias", "Jardim das Palmeiras", "Jardim Europa", "Jardim Holanda", "Jardim Inconfid\xEAncia", "Nova Uberl\xE2ndia", "Residencial Gramado", "Santa Luzia", "S\xE3o Jorge", "Shopping Park"];
  const leste = ["Grand Ville", "Novo Mundo", "Santa M\xF4nica", "Tibery", "Aclima\xE7\xE3o", "Alto Umuarama", "Alvorada", "Cust\xF3dio Pereira", "Granja Marileusa", "Jardim Am\xE9rica", "Morada dos P\xE1ssaros", "Morumbi", "Portal do Vale", "Residencial Integra\xE7\xE3o", "Segismundo Pereira", "Umuarama"];
  const norte = ["Presidente Roosevelt", "Roosevelt", "Distrito Industrial", "Industrial", "Jardim Bras\xEDlia", "Jardim Bras\xEDlia II", "Maravilha", "Marta Helena", "Minas Gerais", "Nossa Senhora das Gra\xE7as", "Pacaembu", "Santa Rosa", "S\xE3o Jos\xE9"];
  const oeste = ["Jaragu\xE1", "Dona Zulmira", "Jardim Patr\xEDcia", "Luizote de Freitas", "Planalto", "Mansour", "Taiaman", "Tocantins"];
  if (central.includes(name)) return "Central";
  if (sul.includes(name)) return "Sul";
  if (leste.includes(name)) return "Leste";
  if (norte.includes(name)) return "Norte";
  if (oeste.includes(name)) return "Oeste";
  return "Central";
}
function getAllMappedNeighborhoods() {
  const list = [];
  let id = 1;
  for (const n of UBERLANDIA_70_NEIGHBORHOODS) {
    list.push({
      id: id++,
      name: n.name,
      zone: getZoneForOriginalNeighborhood(n.name),
      isNew: false,
      carFee: n.carFee,
      coords: n.coords,
      referenceRationale: "Bairro homologado na tabela oficial de 70 bairros Kantine."
    });
  }
  for (const n of UBERLANDIA_ADDITIONAL_NEIGHBORHOODS) {
    list.push({
      id: id++,
      name: n.name,
      zone: n.zone,
      isNew: true,
      carFee: n.carFee,
      coords: n.coords,
      referenceRationale: n.referenceRationale
    });
  }
  return list.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}
function resolveMotoTariff(distKm) {
  const rounded = Math.max(1, Math.ceil(distKm));
  if (rounded <= 20) {
    return { roundedKm: rounded, fee: MOTO_RADIUS_TARIFF_TABLE[rounded], label: `Raio ${rounded} km` };
  }
  return { roundedKm: rounded, fee: null, label: "Acima de 20 km (Sob Consulta)" };
}
function resolveCarTariff(distKm) {
  const rounded = Math.max(1, Math.ceil(distKm));
  if (rounded <= 10) {
    return { roundedKm: rounded, fee: CAR_RADIUS_TARIFF_TABLE[rounded], label: `Raio ${rounded} km` };
  } else if (rounded <= 15) {
    return { roundedKm: rounded, fee: 38, label: "Raio 10-15 km" };
  } else if (rounded <= 20) {
    return { roundedKm: rounded, fee: 44, label: "Raio 15-20 km" };
  }
  return { roundedKm: rounded, fee: null, label: "Acima de 20 km (Sob Consulta)" };
}

// scripts/generate_freight_excel.ts
function font(opts = {}) {
  return {
    name: "Calibri",
    size: 10,
    ...opts
  };
}
async function generateFreightExcelWorkbook() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Kantine Gastronomia";
  workbook.lastModifiedBy = "Kantine Delivery & Log\xEDstica";
  workbook.created = /* @__PURE__ */ new Date();
  workbook.modified = /* @__PURE__ */ new Date();
  const neighborhoods2 = getAllMappedNeighborhoods();
  const matrizCoords = PICKUP_PRESETS.MATRIZ.coords;
  const vinhedosCoords = PICKUP_PRESETS.VINHEDOS.coords;
  const sheetSummary = workbook.addWorksheet("Resumo & Diretrizes", {
    properties: { tabColor: { argb: "FFD97706" } },
    // Amber
    views: [{ showGridLines: true }]
  });
  sheetSummary.columns = [
    { width: 4 },
    { width: 34 },
    { width: 50 },
    { width: 26 },
    { width: 30 }
  ];
  sheetSummary.mergeCells("B2:E2");
  const titleCell = sheetSummary.getCell("B2");
  titleCell.value = "\u{1F370} KANTINE GASTRONOMIA \u2014 TABELA OFICIAL DE FRETES & LOG\xCDSTICA";
  titleCell.font = font({ size: 15, bold: true, color: { argb: "FFFFFFFF" } });
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF92400E" } };
  titleCell.alignment = { vertical: "middle", horizontal: "center" };
  sheetSummary.getRow(2).height = 36;
  sheetSummary.mergeCells("B3:E3");
  const subTitleCell = sheetSummary.getCell("B3");
  subTitleCell.value = "Sistema Unificado de Fretes por Raio Geod\xE9sico (Carro e Moto) \u2022 Uberl\xE2ndia/MG";
  subTitleCell.font = font({ size: 10, italic: true, color: { argb: "FF78350F" } });
  subTitleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
  subTitleCell.alignment = { vertical: "middle", horizontal: "center" };
  sheetSummary.getRow(3).height = 24;
  sheetSummary.getCell("B5").value = "M\xC9TRICAS & DIRETRIZES DO MOTOR DE FRETES";
  sheetSummary.getCell("B5").font = font({ bold: true, size: 11, color: { argb: "FF1F2937" } });
  const kpis = [
    ["Total de Bairros e Setores Mapeados", `${neighborhoods2.length} localidades mapeadas com coordenadas`],
    ["Bairros da Tabela Original", "70 bairros oficiais Kantine"],
    ["Novos Bairros Mapeados & Sugeridos", "40 bairros/setores novos (Destacados em VERDE com tag \u2728 NOVO MAPEADO)"],
    ["Base Geogr\xE1fica Principal (Matriz)", "Daniel Fonseca \u2014 Av. Get\xFAlio Vargas, 1846"],
    ["Base Geogr\xE1fica Secund\xE1ria (Vinhedos)", "Kara\xEDba \u2014 Rua Jos\xE9 Elias, 71"],
    ["Modelo de Precifica\xE7\xE3o Carro", "Por Raio Geod\xE9sico Haversine (1 km a 20 km: R$ 20,00 a R$ 44,00) \u2014 Regra de bairros removida"],
    ["Modelo de Precifica\xE7\xE3o Moto", "Por Raio Geod\xE9sico Haversine (1 km a 20 km: R$ 10,50 a R$ 31,00)"],
    ["Divis\xE3o Financeira Padr\xE3o", "90% Entregador Parceiro (Pre\xE7o Final - 10%) / 10% Taxa de Gest\xE3o Kantine"],
    ["Regra Condom\xEDnio Horizontal", "+20% sobre a tarifa-base da parada (exclusivo para modalidade Carro)"],
    ["Regra de Agrupamento (Rotas 2+ paradas)", "70% do frete integral por parada agrupada (fator 0.70)"]
  ];
  let rIdx = 6;
  for (const [k, v] of kpis) {
    const kCell = sheetSummary.getCell(`B${rIdx}`);
    kCell.value = k;
    kCell.font = font({ bold: true, size: 10, color: { argb: "FF374151" } });
    kCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
    kCell.border = {
      top: { style: "thin", color: { argb: "FFE5E7EB" } },
      bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
      left: { style: "thin", color: { argb: "FFE5E7EB" } },
      right: { style: "thin", color: { argb: "FFE5E7EB" } }
    };
    sheetSummary.mergeCells(`C${rIdx}:E${rIdx}`);
    const vCell = sheetSummary.getCell(`C${rIdx}`);
    vCell.value = v;
    vCell.font = font({ size: 10, color: { argb: "FF111827" } });
    vCell.border = {
      top: { style: "thin", color: { argb: "FFE5E7EB" } },
      bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
      left: { style: "thin", color: { argb: "FFE5E7EB" } },
      right: { style: "thin", color: { argb: "FFE5E7EB" } }
    };
    sheetSummary.getRow(rIdx).height = 20;
    rIdx++;
  }
  rIdx += 2;
  sheetSummary.getCell(`B${rIdx}`).value = "LEGENDA DE ABAS DA PLANILHA";
  sheetSummary.getCell(`B${rIdx}`).font = font({ bold: true, size: 11, color: { argb: "FF1F2937" } });
  rIdx++;
  const sheetDescriptions = [
    ["\u{1F697} Tabela Carro por Raio", "Tabela oficial de Carro por dist\xE2ncia (1 a 20 km) conforme nova tabela (Pre\xE7o Final: R$ 20 a R$ 44; Motorista -10%)"],
    ["\u{1F3CD}\uFE0F Tabela Moto por Raio", "Tabela oficial de Moto por raio geod\xE9sico (1 a 20 km: R$ 10,50 a R$ 31,00)"],
    ["\u{1F5FA}\uFE0F Tabela por Bairros (110)", "110 bairros de Uberl\xE2ndia com dist\xE2ncias das 2 unidades e tarifas calculadas por raio"],
    ["\u{1F4D0} Simulador e Regras", "Exemplos pr\xE1ticos de agrupamento (70%) e adicional de condom\xEDnio horizontal (+20%)"]
  ];
  for (const [aba, desc7] of sheetDescriptions) {
    sheetSummary.getCell(`B${rIdx}`).value = aba;
    sheetSummary.getCell(`B${rIdx}`).font = font({ bold: true, size: 10, color: { argb: "FF1E40AF" } });
    sheetSummary.getCell(`B${rIdx}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF6FF" } };
    sheetSummary.getCell(`B${rIdx}`).border = {
      top: { style: "thin", color: { argb: "FFE5E7EB" } },
      bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
      left: { style: "thin", color: { argb: "FFE5E7EB" } },
      right: { style: "thin", color: { argb: "FFE5E7EB" } }
    };
    sheetSummary.mergeCells(`C${rIdx}:E${rIdx}`);
    const dCell = sheetSummary.getCell(`C${rIdx}`);
    dCell.value = desc7;
    dCell.font = font({ size: 10, color: { argb: "FF374151" } });
    dCell.border = {
      top: { style: "thin", color: { argb: "FFE5E7EB" } },
      bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
      left: { style: "thin", color: { argb: "FFE5E7EB" } },
      right: { style: "thin", color: { argb: "FFE5E7EB" } }
    };
    sheetSummary.getRow(rIdx).height = 20;
    rIdx++;
  }
  const sheetCarRadius = workbook.addWorksheet("Tabela Carro por Raio", {
    properties: { tabColor: { argb: "FFEA580C" } },
    // Orange
    views: [{ state: "frozen", ySplit: 3, showGridLines: true }]
  });
  sheetCarRadius.columns = [
    { width: 14 },
    // A: Distância (km)
    { width: 22 },
    // B: Intervalo Geodésico
    { width: 18 },
    // C: Preço (R$)
    { width: 22 },
    // D: Repasse Motorista (90%)
    { width: 22 },
    // E: Margem Kantine (10%)
    { width: 45 },
    // F: Exemplos de Bairros no Raio
    { width: 45 }
    // G: Diretriz Operacional
  ];
  sheetCarRadius.mergeCells("A1:G1");
  const cHeader = sheetCarRadius.getCell("A1");
  cHeader.value = "TABELA OFICIAL DE CARRO POR DIST\xC2NCIA / RAIO GEOGR\xC1FICO (1 A 20 KM)";
  cHeader.font = font({ size: 13, bold: true, color: { argb: "FFFFFFFF" } });
  cHeader.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC2410C" } };
  cHeader.alignment = { vertical: "middle", horizontal: "center" };
  sheetCarRadius.getRow(1).height = 30;
  sheetCarRadius.mergeCells("A2:G2");
  const cSub = sheetCarRadius.getCell("A2");
  cSub.value = "Regra Oficial Kantine: C\xE1lculo por Dist\xE2ncia Geod\xE9sica Haversine \u2022 Condom\xEDnio Horizontal (+20% na Base)";
  cSub.font = font({ size: 10, italic: true, color: { argb: "FF7C2D12" } });
  cSub.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFEDD5" } };
  cSub.alignment = { vertical: "middle", horizontal: "center" };
  sheetCarRadius.getRow(2).height = 20;
  const carHeaders = [
    "Dist\xE2ncia (km)",
    "Intervalo Geod\xE9sico",
    "Pre\xE7o Final (R$)",
    "Repasse Motorista (-10%) (90%)",
    "Taxa Kantine Gest\xE3o (10%)",
    "Exemplos de Bairros no Raio (a partir da Matriz)",
    "Diretriz Operacional"
  ];
  const carHeaderRow = sheetCarRadius.getRow(3);
  carHeaderRow.height = 26;
  carHeaderRow.values = carHeaders;
  carHeaderRow.eachCell((cell) => {
    cell.font = font({ size: 10, bold: true, color: { argb: "FFFFFFFF" } });
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF9A3412" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = {
      top: { style: "medium", color: { argb: "FF431407" } },
      bottom: { style: "medium", color: { argb: "FF431407" } },
      left: { style: "thin", color: { argb: "FFFB923C" } },
      right: { style: "thin", color: { argb: "FFFB923C" } }
    };
  });
  const carRowsData = [
    { km: "1", range: "At\xE9 1,0 km", fee: 20, examples: "Daniel Fonseca, Tabajaras, Martins", note: "Tarifa M\xEDnima de Carro (Pre\xE7o Final: R$ 20,00 | Motorista: R$ 18,00)" },
    { km: "2", range: "1,1 a 2,0 km", fee: 23, examples: "Centro, Fundinho, Osvaldo Rezende, Cazeca, L\xEDdice", note: "\xC1rea central e adjac\xEAncias (Pre\xE7o Final: R$ 23,00 | Motorista: R$ 20,70)" },
    { km: "3", range: "2,1 a 3,0 km", fee: 25, examples: "Brasil, Tubalina, Patrim\xF4nio, Jaragu\xE1, Saraiva", note: "Regi\xE3o pericentral consolidada (Pre\xE7o Final: R$ 25,00 | Motorista: R$ 22,50)" },
    { km: "4", range: "3,1 a 4,0 km", fee: 27, examples: "Copacabana, Santa Maria, Vigilato Pereira, Roosevelt", note: "Primeiro anel vi\xE1rio urbano (Pre\xE7o Final: R$ 27,00 | Motorista: R$ 24,30)" },
    { km: "5", range: "4,1 a 5,0 km", fee: 29, examples: "Santa M\xF4nica, Tibery, Caraj\xE1s, Morada da Colina, Lagoinha", note: "Bairros residenciais de alta densidade (Pre\xE7o Final: R$ 29,00 | Motorista: R$ 26,10)" },
    { km: "6", range: "5,1 a 6,0 km", fee: 30, examples: "Jardim Bot\xE2nico, G\xE1vea, Jardim Kara\xEDba, Dona Zulmira", note: "Zona Sul Nobre e Zona Oeste (Pre\xE7o Final: R$ 30,00 | Motorista: R$ 27,00)" },
    { km: "7", range: "6,1 a 7,0 km", fee: 31, examples: "Luizote de Freitas, Grand Ville, Shopping Park, Santa Luzia", note: "Faixa de 7 km (Pre\xE7o Final: R$ 31,00 | Motorista: R$ 27,90)" },
    { km: "8", range: "7,1 a 8,0 km", fee: 32, examples: "Novo Mundo, Umuarama, Cust\xF3dio Pereira, Marta Helena", note: "Faixa de 8 km (Pre\xE7o Final: R$ 32,00 | Motorista: R$ 28,80)" },
    { km: "9", range: "8,1 a 9,0 km", fee: 33, examples: "Granja Marileusa, Aclima\xE7\xE3o, Morumbi, Pacaembu", note: "Faixa de 9 km (Pre\xE7o Final: R$ 33,00 | Motorista: R$ 29,70)" },
    { km: "10", range: "9,1 a 10,0 km", fee: 33, examples: "Distrito Industrial, Dom Almir, Residencial Integra\xE7\xE3o, Portal do Vale", note: "Faixa de 10 km (Pre\xE7o Final: R$ 33,00 | Motorista: R$ 29,70)" },
    { km: "10-15", range: "10,1 a 15,0 km", fee: 38, examples: "Morada Nova, Residencial Pequis, S\xE3o Francisco, Monte Hebron", note: "Faixa ampliada de 10 a 15 km (Pre\xE7o Final: R$ 38,00 | Motorista: R$ 34,20)" },
    { km: "15-20", range: "15,1 a 20,0 km", fee: 44, examples: "Extremo Oeste, Sa\xEDda Pau Furado, Cruzeiro dos Peixotos (per\xEDmetro)", note: "Faixa periurbana de 15 a 20 km (Pre\xE7o Final: R$ 44,00 | Motorista: R$ 39,60)" }
  ];
  let carRowIdx = 4;
  for (const item of carRowsData) {
    const row = sheetCarRadius.getRow(carRowIdx);
    row.height = 22;
    const driverShare = parseFloat((item.fee * 0.9).toFixed(2));
    const kantineShare = parseFloat((item.fee * 0.1).toFixed(2));
    row.values = [
      item.km,
      item.range,
      item.fee,
      { formula: `C${carRowIdx}*0.9`, result: driverShare },
      { formula: `C${carRowIdx}*0.1`, result: kantineShare },
      item.examples,
      item.note
    ];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFE5E7EB" } },
        bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
        left: { style: "thin", color: { argb: "FFE5E7EB" } },
        right: { style: "thin", color: { argb: "FFE5E7EB" } }
      };
      const isEven = carRowIdx % 2 === 0;
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: isEven ? "FFFFFFFF" : "FFFFF7ED" }
      };
      cell.font = font({
        size: 10,
        bold: colNumber === 1 || colNumber === 3,
        color: colNumber === 3 ? { argb: "FFC2410C" } : { argb: "FF1F2937" }
      });
      if ([1, 2].includes(colNumber)) {
        cell.alignment = { horizontal: "center", vertical: "middle" };
      } else if ([3, 4, 5].includes(colNumber)) {
        cell.numFmt = '"R$" #,##0.00';
        cell.alignment = { horizontal: "right", vertical: "middle" };
      } else {
        cell.alignment = { horizontal: "left", vertical: "middle" };
      }
    });
    carRowIdx++;
  }
  const carConsultRow = sheetCarRadius.getRow(carRowIdx);
  carConsultRow.height = 24;
  carConsultRow.values = [
    "> 20 km",
    "Acima de 20.0 km",
    "SOB CONSULTA",
    "SOB CONSULTA",
    "SOB CONSULTA",
    "Distritos de Miraporanga (~22km), Martin\xE9sia (~23km), Tapuirama (~28.5km)",
    "Confirma\xE7\xE3o manual obrigat\xF3ria com entregador e cliente"
  ];
  carConsultRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
    cell.font = font({ size: 10, bold: true, color: { argb: "FF92400E" } });
    cell.border = {
      top: { style: "medium", color: { argb: "FFEA580C" } },
      bottom: { style: "medium", color: { argb: "FFEA580C" } },
      left: { style: "thin", color: { argb: "FFEA580C" } },
      right: { style: "thin", color: { argb: "FFEA580C" } }
    };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });
  const sheetRadius = workbook.addWorksheet("Tabela Moto por Raio", {
    properties: { tabColor: { argb: "FF2563EB" } },
    // Blue
    views: [{ state: "frozen", ySplit: 3, showGridLines: true }]
  });
  sheetRadius.columns = [
    { width: 12 },
    // A: Faixa de Raio
    { width: 22 },
    // B: Intervalo Geodésico
    { width: 18 },
    // C: Tarifa Moto (R$)
    { width: 22 },
    // D: Repasse Motorista (90%)
    { width: 22 },
    // E: Margem Kantine (10%)
    { width: 45 },
    // F: Exemplos de Bairros no Raio
    { width: 45 }
    // G: Diretriz Operacional
  ];
  sheetRadius.mergeCells("A1:G1");
  const rHeader = sheetRadius.getCell("A1");
  rHeader.value = "TABELA OFICIAL DE MOTO POR RAIO GEOGR\xC1FICO HAVERSINE (1 A 20 KM)";
  rHeader.font = font({ size: 13, bold: true, color: { argb: "FFFFFFFF" } });
  rHeader.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E40AF" } };
  rHeader.alignment = { vertical: "middle", horizontal: "center" };
  sheetRadius.getRow(1).height = 30;
  sheetRadius.mergeCells("A2:G2");
  const rSub = sheetRadius.getCell("A2");
  rSub.value = "Regra Oficial Kantine: Raio Geod\xE9sico em Linha Reta \u2022 Entregas de Moto n\xE3o possuem taxa extra de condom\xEDnio";
  rSub.font = font({ size: 10, italic: true, color: { argb: "FF1E293B" } });
  rSub.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
  rSub.alignment = { vertical: "middle", horizontal: "center" };
  sheetRadius.getRow(2).height = 20;
  const radiusHeaders = [
    "Faixa de Raio",
    "Intervalo Geod\xE9sico",
    "Tarifa Moto (R$)",
    "Repasse Motorista (90%)",
    "Margem Kantine (10%)",
    "Exemplos de Bairros no Raio (a partir da Matriz)",
    "Diretriz Operacional"
  ];
  const radiusHeaderRow = sheetRadius.getRow(3);
  radiusHeaderRow.height = 26;
  radiusHeaderRow.values = radiusHeaders;
  radiusHeaderRow.eachCell((cell) => {
    cell.font = font({ size: 10, bold: true, color: { argb: "FFFFFFFF" } });
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = {
      top: { style: "medium", color: { argb: "FF0F172A" } },
      bottom: { style: "medium", color: { argb: "FF0F172A" } },
      left: { style: "thin", color: { argb: "FF93C5FD" } },
      right: { style: "thin", color: { argb: "FF93C5FD" } }
    };
  });
  const radiusNeighborhoodExamples = {
    1: "Daniel Fonseca, Tabajaras, Martins",
    2: "Centro, Fundinho, Osvaldo Rezende, Cazeca, L\xEDdice, Bom Jesus",
    3: "Brasil, Tubalina, Patrim\xF4nio, Jaragu\xE1, Saraiva, Cidade Jardim",
    4: "Copacabana, Santa Maria, Vigilato Pereira, Roosevelt, Ch\xE1caras Tubalina",
    5: "Santa M\xF4nica, Tibery, Caraj\xE1s, Morada da Colina, Lagoinha, Pampulha",
    6: "Jardim Bot\xE2nico, G\xE1vea, Jardim Kara\xEDba, Dona Zulmira, Jardim Patr\xEDcia, Planalto",
    7: "Luizote de Freitas, Grand Ville, Shopping Park, Santa Luzia, Taiaman",
    8: "Novo Mundo, Umuarama, Cust\xF3dio Pereira, Marta Helena, Jardim Bras\xEDlia",
    9: "Granja Marileusa, Aclima\xE7\xE3o, Morumbi, Pacaembu, Guarani, Jardim C\xE9lia",
    10: "Distrito Industrial, Dom Almir, Residencial Integra\xE7\xE3o, Portal do Vale, Joana D'Arc",
    11: "Morada Nova, Residencial Pequis, S\xE3o Francisco, Celebridade, Alvino Silva",
    12: "Monte Hebron, Solidariedade, Ch\xE1caras Douradinho",
    13: "Ch\xE1caras Camping Clube (BR-452)",
    14: "Extremo Leste / Sa\xEDda BR-452",
    15: "\xC1rea Periurbana Leste / Represa de Capim Branco",
    16: "Extremo Oeste / Sa\xEDda Tupaciguara",
    17: "\xC1rea Rural / Estrada do Pau Furado",
    18: "Cruzeiro dos Peixotos (Per\xEDmetro)",
    19: "Distrito Cruzeiro dos Peixotos (~18.5 km)",
    20: "Limite Municipal Urbano de 20 km"
  };
  const radiusNotes = {
    1: "Tarifa M\xEDnima Operacional de Moto (R$ 10,50)",
    2: "Regi\xE3o Central e Hipercentro",
    3: "Regi\xE3o Pericentral Expandida",
    4: "Primeiro Anel de Bairros Estruturados",
    5: "Bairros de Alta Densidade / Universidades",
    6: "Zona Sul Nobre e Zona Oeste Consolidada",
    7: "Zonas Residenciais Intermedi\xE1rias",
    8: "In\xEDcio de Vetores de Expans\xE3o Norte/Leste",
    9: "Polo Tecnol\xF3gico / Bairros Perif\xE9ricos Leste",
    10: "Limite da Malha Urbana Central Integrada",
    11: "Bairros de Grande Porte da Periferia Oeste/Leste",
    12: "Bairros Habitacionais e Ch\xE1caras Estruturadas",
    13: "Setor de Ch\xE1caras e Condom\xEDnios Rurais",
    14: "Raio de M\xE9dia/Longa Dist\xE2ncia",
    15: "Raio de M\xE9dia/Longa Dist\xE2ncia",
    16: "Raio de M\xE9dia/Longa Dist\xE2ncia",
    17: "Raio Longo Periurbano",
    18: "Raio Longo Periurbano",
    19: "Proximidade de Distritos Municipais",
    20: "Teto M\xE1ximo Tarifado Automaticamente por Raio"
  };
  let radiusRowIdx = 4;
  for (let km = 1; km <= 20; km++) {
    const fee = MOTO_RADIUS_TARIFF_TABLE[km];
    const row = sheetRadius.getRow(radiusRowIdx);
    row.height = 22;
    const lowerBound = km === 1 ? "0.0" : (km - 1 + 0.1).toFixed(1);
    const rangeText = `${lowerBound} km a ${km}.0 km`;
    const driverShare = parseFloat((fee * 0.9).toFixed(2));
    const kantineShare = parseFloat((fee * 0.1).toFixed(2));
    row.values = [
      `At\xE9 ${km} km`,
      rangeText,
      fee,
      { formula: `C${radiusRowIdx}*0.9`, result: driverShare },
      { formula: `C${radiusRowIdx}*0.1`, result: kantineShare },
      radiusNeighborhoodExamples[km] || "Uberl\xE2ndia",
      radiusNotes[km] || "Tarifa Padr\xE3o por Raio"
    ];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFE5E7EB" } },
        bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
        left: { style: "thin", color: { argb: "FFE5E7EB" } },
        right: { style: "thin", color: { argb: "FFE5E7EB" } }
      };
      const isEven = radiusRowIdx % 2 === 0;
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: isEven ? "FFFFFFFF" : "FFF8FAFC" }
      };
      cell.font = font({
        size: 10,
        bold: colNumber === 1 || colNumber === 3,
        color: colNumber === 3 ? { argb: "FF1E40AF" } : { argb: "FF1F2937" }
      });
      if ([1, 2].includes(colNumber)) {
        cell.alignment = { horizontal: "center", vertical: "middle" };
      } else if ([3, 4, 5].includes(colNumber)) {
        cell.numFmt = '"R$" #,##0.00';
        cell.alignment = { horizontal: "right", vertical: "middle" };
      } else {
        cell.alignment = { horizontal: "left", vertical: "middle" };
      }
    });
    radiusRowIdx++;
  }
  const consultRow = sheetRadius.getRow(radiusRowIdx);
  consultRow.height = 24;
  consultRow.values = [
    "> 20 km",
    "Acima de 20.0 km (Distritos e Zona Rural)",
    "SOB CONSULTA",
    "SOB CONSULTA",
    "SOB CONSULTA",
    "Miraporanga (~22km), Martin\xE9sia (~23km), Tapuirama (~28.5km)",
    "Confirma\xE7\xE3o manual obrigat\xF3ria pelo operador com entregador parceiro"
  ];
  consultRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
    cell.font = font({ size: 10, bold: true, color: { argb: "FF92400E" } });
    cell.border = {
      top: { style: "medium", color: { argb: "FFD97706" } },
      bottom: { style: "medium", color: { argb: "FFD97706" } },
      left: { style: "thin", color: { argb: "FFD97706" } },
      right: { style: "thin", color: { argb: "FFD97706" } }
    };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });
  const sheetNeighborhoods = workbook.addWorksheet("Tabela por Bairros (110)", {
    properties: { tabColor: { argb: "FF059669" } },
    // Emerald Green
    views: [{ state: "frozen", ySplit: 3, showGridLines: true }]
  });
  sheetNeighborhoods.columns = [
    { width: 6 },
    // A: Nº
    { width: 18 },
    // B: Status / Origem (Destaque novos)
    { width: 32 },
    // C: Nome do Bairro
    { width: 16 },
    // D: Região/Zona
    { width: 18 },
    // E: Distância Matriz (km)
    { width: 18 },
    // F: Distância Vinhedos (km)
    { width: 22 },
    // G: Tarifa Carro (por Raio)
    { width: 22 },
    // H: Repasse Carro (90%)
    { width: 20 },
    // I: Margem Carro (10%)
    { width: 20 },
    // J: Raio Moto Aplicável
    { width: 18 },
    // K: Tarifa Moto (R$)
    { width: 20 },
    // L: Repasse Moto (90%)
    { width: 18 },
    // M: Margem Moto (10%)
    { width: 50 },
    // N: Critério / Rationale
    { width: 14 },
    // O: Latitude
    { width: 14 }
    // P: Longitude
  ];
  sheetNeighborhoods.mergeCells("A1:P1");
  const nHeader = sheetNeighborhoods.getCell("A1");
  nHeader.value = "TABELA COMPLETA DE BAIRROS DE UBERL\xC2NDIA/MG COM TARIFAS POR RAIO (CARRO & MOTO)";
  nHeader.font = font({ size: 14, bold: true, color: { argb: "FFFFFFFF" } });
  nHeader.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF065F46" } };
  nHeader.alignment = { vertical: "middle", horizontal: "center" };
  sheetNeighborhoods.getRow(1).height = 32;
  sheetNeighborhoods.mergeCells("A2:P2");
  const nSub = sheetNeighborhoods.getCell("A2");
  nSub.value = "110 Bairros Mapeados: 70 Oficiais Kantine + 40 Novos Bairros Inseridos com Destaque Visual em Verde";
  nSub.font = font({ size: 10, italic: true, color: { argb: "FF1E293B" } });
  nSub.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1FAE5" } };
  nSub.alignment = { vertical: "middle", horizontal: "center" };
  sheetNeighborhoods.getRow(2).height = 20;
  const colHeaders = [
    "N\xBA",
    "Status / Origem",
    "Bairro",
    "Regi\xE3o / Zona",
    "Dist. Matriz (km)",
    "Dist. Vinhedos (km)",
    "Tarifa Carro Raio (R$)",
    "Repasse Carro (90%)",
    "Margem Carro (10%)",
    "Raio Moto Aplic\xE1vel",
    "Tarifa Moto (R$)",
    "Repasse Moto (90%)",
    "Margem Moto (10%)",
    "Crit\xE9rio / Bairro de Refer\xEAncia",
    "Latitude",
    "Longitude"
  ];
  const headerRow = sheetNeighborhoods.getRow(3);
  headerRow.height = 26;
  headerRow.values = colHeaders;
  headerRow.eachCell((cell) => {
    cell.font = font({ size: 10, bold: true, color: { argb: "FFFFFFFF" } });
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF047857" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: { style: "medium", color: { argb: "FF064E3B" } },
      bottom: { style: "medium", color: { argb: "FF064E3B" } },
      left: { style: "thin", color: { argb: "FF6EE7B7" } },
      right: { style: "thin", color: { argb: "FF6EE7B7" } }
    };
  });
  let rowCount = 4;
  for (let i = 0; i < neighborhoods2.length; i++) {
    const item = neighborhoods2[i];
    const distMatriz = calculateHaversineDistanceKm(
      matrizCoords.lat,
      matrizCoords.lng,
      item.coords.lat,
      item.coords.lng
    );
    const distVinhedos = calculateHaversineDistanceKm(
      vinhedosCoords.lat,
      vinhedosCoords.lng,
      item.coords.lat,
      item.coords.lng
    );
    const carTariff = resolveCarTariff(distMatriz);
    const motoTariff = resolveMotoTariff(distMatriz);
    const currentRow = sheetNeighborhoods.getRow(rowCount);
    const originText = item.isNew ? "\u2728 NOVO MAPEADO" : "OFICIAL (70)";
    const carFeeValue = carTariff.fee !== null ? carTariff.fee : "SOB CONSULTA";
    const carDriverShareObj = carTariff.fee !== null ? { formula: `G${rowCount}*0.9`, result: parseFloat((carTariff.fee * 0.9).toFixed(2)) } : "SOB CONSULTA";
    const carKantineShareObj = carTariff.fee !== null ? { formula: `G${rowCount}*0.1`, result: parseFloat((carTariff.fee * 0.1).toFixed(2)) } : "SOB CONSULTA";
    const motoFeeValue = motoTariff.fee !== null ? motoTariff.fee : "SOB CONSULTA";
    const motoDriverShareObj = motoTariff.fee !== null ? { formula: `K${rowCount}*0.9`, result: parseFloat((motoTariff.fee * 0.9).toFixed(2)) } : "SOB CONSULTA";
    const motoKantineShareObj = motoTariff.fee !== null ? { formula: `K${rowCount}*0.1`, result: parseFloat((motoTariff.fee * 0.1).toFixed(2)) } : "SOB CONSULTA";
    currentRow.values = [
      i + 1,
      originText,
      item.name,
      item.zone,
      parseFloat(distMatriz.toFixed(1)),
      parseFloat(distVinhedos.toFixed(1)),
      carFeeValue,
      carDriverShareObj,
      carKantineShareObj,
      motoTariff.label,
      motoFeeValue,
      motoDriverShareObj,
      motoKantineShareObj,
      item.referenceRationale,
      item.coords.lat,
      item.coords.lng
    ];
    const isNew = item.isNew;
    const bgColor = isNew ? "FFE8F8EE" : rowCount % 2 === 0 ? "FFFFFFFF" : "FFF9FAFB";
    const borderColor = isNew ? "FF6EE7B7" : "FFE5E7EB";
    currentRow.height = 22;
    currentRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: bgColor }
      };
      cell.border = {
        top: { style: "thin", color: { argb: borderColor } },
        bottom: { style: "thin", color: { argb: borderColor } },
        left: { style: "thin", color: { argb: borderColor } },
        right: { style: "thin", color: { argb: borderColor } }
      };
      cell.font = font({
        size: 10,
        bold: colNumber === 3 || colNumber === 2 && isNew || colNumber === 7 || colNumber === 11,
        color: colNumber === 2 && isNew ? { argb: "FF065F46" } : { argb: "FF1F2937" }
      });
      if ([5, 6].includes(colNumber)) {
        cell.numFmt = '0.0 "km"';
        cell.alignment = { horizontal: "right", vertical: "middle" };
      } else if ([7, 8, 9, 11, 12, 13].includes(colNumber)) {
        if (typeof cell.value === "number" || typeof cell.value === "object" && cell.value !== null) {
          cell.numFmt = '"R$" #,##0.00';
          cell.alignment = { horizontal: "right", vertical: "middle" };
        } else {
          cell.alignment = { horizontal: "center", vertical: "middle" };
        }
      } else if ([1, 2, 4, 10].includes(colNumber)) {
        cell.alignment = { horizontal: "center", vertical: "middle" };
      } else if ([15, 16].includes(colNumber)) {
        cell.numFmt = "0.0000";
        cell.alignment = { horizontal: "right", vertical: "middle" };
      } else {
        cell.alignment = { horizontal: "left", vertical: "middle" };
      }
    });
    rowCount++;
  }
  const sheetSim = workbook.addWorksheet("Simulador e Regras", {
    properties: { tabColor: { argb: "FF6366F1" } },
    // Indigo
    views: [{ showGridLines: true }]
  });
  sheetSim.columns = [
    { width: 4 },
    { width: 35 },
    { width: 25 },
    { width: 25 },
    { width: 25 },
    { width: 35 }
  ];
  sheetSim.mergeCells("B2:F2");
  const simTitle = sheetSim.getCell("B2");
  simTitle.value = "MOTOR DE FRETES KANTINE \u2014 REGRAS DE AGRUPAMENTO & REPASSE";
  simTitle.font = font({ size: 13, bold: true, color: { argb: "FFFFFFFF" } });
  simTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4338CA" } };
  simTitle.alignment = { vertical: "middle", horizontal: "center" };
  sheetSim.getRow(2).height = 32;
  const simSections = [
    {
      title: "1. REGRA DE M\xDALTIPLAS ENTREGAS (AGRUPAMENTO \u2014 70% POR PARADA)",
      desc: "Quando uma rota possui 2 ou mais entregas, cada parada recebe desconto de 30% no valor cobrado (fator 0.70), barateando o custo por cliente e otimizando os ganhos do motorista por hora.",
      examples: [
        ["1 Entrega Isolada (Carro Raio 3 km \u2014 Pre\xE7o Final R$ 25,00)", "R$ 25,00 (100%)", "Motorista: R$ 22,50 (90%)", "Kantine: R$ 2,50 (10%)"],
        ["2 Entregas Agrupadas (2 x R$ 25,00 com fator 70%)", "R$ 35,00 (2 x R$ 17,50)", "Motorista: R$ 31,50 (90%)", "Kantine: R$ 3,50 (10%)"],
        ["3 Entregas Agrupadas (3 x R$ 25,00 com fator 70%)", "R$ 52,50 (3 x R$ 17,50)", "Motorista: R$ 47,25 (90%)", "Kantine: R$ 5,25 (10%)"]
      ]
    },
    {
      title: "2. ADICIONAL DE CONDOM\xCDNIO HORIZONTAL (+20%)",
      desc: "Para entregas de Carro em condom\xEDnios horizontais fechados (ex: Cyrela, Bosque Kara\xEDba, Paradiso, Village Altamira), incide acr\xE9scimo de +20% na tarifa-base para compensar o tempo de portaria e deslocamento interno.",
      examples: [
        ["Carro Raio 3 km Padr\xE3o (Sem Condom\xEDnio)", "R$ 25,00", "Motorista: R$ 22,50 (90%)", "Kantine: R$ 2,50 (10%)"],
        ["Carro Raio 3 km + Condom\xEDnio Horizontal (+20%)", "R$ 30,00 (+20%)", "Motorista: R$ 27,00 (90%)", "Kantine: R$ 3,00 (10%)"],
        ["Carro Raio 7 km + Condom\xEDnio Horizontal (+20%)", "R$ 37,20 (+20% s/ R$31)", "Motorista: R$ 33,48 (90%)", "Kantine: R$ 3,72 (10%)"]
      ]
    }
  ];
  let sRow = 4;
  for (const sec of simSections) {
    sheetSim.mergeCells(`B${sRow}:F${sRow}`);
    const secHeader = sheetSim.getCell(`B${sRow}`);
    secHeader.value = sec.title;
    secHeader.font = font({ bold: true, size: 11, color: { argb: "FFFFFFFF" } });
    secHeader.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF312E81" } };
    sheetSim.getRow(sRow).height = 24;
    sRow++;
    sheetSim.mergeCells(`B${sRow}:F${sRow}`);
    const secDesc = sheetSim.getCell(`B${sRow}`);
    secDesc.value = sec.desc;
    secDesc.font = font({ italic: true, size: 10, color: { argb: "FF374151" } });
    sheetSim.getRow(sRow).height = 26;
    sRow++;
    for (const ex of sec.examples) {
      sheetSim.getCell(`B${sRow}`).value = ex[0];
      sheetSim.getCell(`C${sRow}`).value = ex[1];
      sheetSim.getCell(`D${sRow}`).value = ex[2];
      sheetSim.getCell(`E${sRow}`).value = ex[3];
      for (let c = 2; c <= 5; c++) {
        const colLetter = String.fromCharCode(64 + c);
        const cell = sheetSim.getCell(`${colLetter}${sRow}`);
        cell.font = font({ size: 10, bold: c === 2 || c === 3 });
        cell.border = {
          top: { style: "thin", color: { argb: "FFE5E7EB" } },
          bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
          left: { style: "thin", color: { argb: "FFE5E7EB" } },
          right: { style: "thin", color: { argb: "FFE5E7EB" } }
        };
      }
      sheetSim.getRow(sRow).height = 20;
      sRow++;
    }
    sRow += 2;
  }
  return workbook;
}
async function main() {
  const exportDir = path.resolve(process.cwd(), "public", "downloads");
  fs.mkdirSync(exportDir, { recursive: true });
  const wb = await generateFreightExcelWorkbook();
  const file1 = path.join(exportDir, "Tabela_de_Fretes_Kantine_Gastronomia_Uberlandia.xlsx");
  const file2 = path.join(exportDir, "Tabela_de_Fretes.xlsx");
  await wb.xlsx.writeFile(file1);
  await wb.xlsx.writeFile(file2);
  console.log("\u2705 Arquivos Excel gerados com sucesso!");
  console.log("1:", file1, fs.statSync(file1).size, "bytes");
  console.log("2:", file2, fs.statSync(file2).size, "bytes");
}
if (process.argv[1] && process.argv[1].includes("generate_freight_excel")) {
  main().catch(console.error);
}

// server.ts
init_driverService();

// src/server/deliveryService.ts
init_db();
init_schema();
init_eligibility();
init_telegramBot();
init_driverService();
import { eq as eq7, desc as desc5, and as and5, sql as sql7 } from "drizzle-orm";
var DeliveryService = class {
  /**
   * Create a delivery as DRAFT
   * Never sends any Telegram message
   */
  async createDraft(data, actor) {
    if (!data.destination_address || !data.destination_neighborhood || !data.cargo_description || !data.delivery_fee) {
      throw new Error("MISSING_REQUIRED_FIELDS");
    }
    const pickupLocation = data.pickup_location?.trim() || "Kantine Matriz";
    const deliveryMode = data.delivery_mode === "NO_CONTACT" ? "NO_CONTACT" : "IN_PERSON";
    const [newDelivery] = await db.insert(deliveries).values({
      pickup_location: pickupLocation,
      destination_address: data.destination_address.trim(),
      destination_neighborhood: data.destination_neighborhood.trim(),
      cargo_description: data.cargo_description.trim(),
      delivery_fee: data.delivery_fee.trim(),
      delivery_mode: deliveryMode,
      observations: data.observations?.trim() || null,
      status: "DRAFT"
    }).returning();
    await db.insert(deliveryEvents).values({
      delivery_id: newDelivery.id,
      event_type: "DELIVERY_CREATED",
      actor: actor || "ADMIN"
    });
    return newDelivery;
  }
  async getDeliveryById(id) {
    const rows = await db.select().from(deliveries).where(eq7(deliveries.id, id));
    if (rows.length === 0) return null;
    return rows[0];
  }
  async getDeliveries(status) {
    let query = db.select().from(deliveries);
    if (status) {
      query = query.where(eq7(deliveries.status, status));
    }
    const rows = await query.orderBy(desc5(deliveries.id));
    return rows;
  }
  async getDeliveryDetails(id) {
    const delivery = await this.getDeliveryById(id);
    if (!delivery) throw new Error("DELIVERY_NOT_FOUND");
    const dispatchesRows = await db.select().from(deliveryOfferDispatches).where(eq7(deliveryOfferDispatches.delivery_id, id));
    const eventsRows = await db.select().from(deliveryEvents).where(eq7(deliveryEvents.delivery_id, id)).orderBy(desc5(deliveryEvents.timestamp));
    const sent = dispatchesRows.filter((d) => d.status === "SENT").length;
    const failed = dispatchesRows.filter((d) => d.status === "FAILED").length;
    return {
      delivery,
      dispatches: dispatchesRows,
      events: eventsRows,
      stats: { sent, failed }
    };
  }
  /**
   * Publish Delivery: DRAFT -> OFFERED
   * Distributes offer individually to all eligible ACTIVE drivers
   */
  async publishDelivery(id, actor) {
    const delivery = await this.getDeliveryById(id);
    if (!delivery) throw new Error("DELIVERY_NOT_FOUND");
    if (delivery.status === "OFFERED") {
      throw new Error("DELIVERY_ALREADY_OFFERED");
    }
    if (delivery.status === "CANCELLED") {
      throw new Error("CANNOT_PUBLISH_CANCELLED_DELIVERY");
    }
    const allDrivers = await driverService.getDrivers();
    const eligibleDrivers = allDrivers.filter((driver) => canReceiveDeliveryOffers(driver));
    if (eligibleDrivers.length === 0) {
      throw new Error("NO_ACTIVE_DRIVERS_AVAILABLE");
    }
    const [updatedDelivery] = await db.update(deliveries).set({
      status: "OFFERED",
      offered_at: /* @__PURE__ */ new Date()
    }).where(eq7(deliveries.id, id)).returning();
    await db.insert(deliveryEvents).values({
      delivery_id: id,
      event_type: "DELIVERY_OFFERED",
      actor: actor || "ADMIN"
    });
    const recordedDispatches = [];
    let sentCount = 0;
    let failedCount = 0;
    for (const driver of eligibleDrivers) {
      try {
        const sendResult = await telegramBot.sendDeliveryOffer(
          driver.telegram_chat_id,
          updatedDelivery
        );
        const dispatchStatus = sendResult.success ? "SENT" : "FAILED";
        if (dispatchStatus === "SENT") {
          sentCount++;
        } else {
          failedCount++;
        }
        const [disp] = await db.insert(deliveryOfferDispatches).values({
          delivery_id: id,
          driver_id: driver.id,
          telegram_chat_id: driver.telegram_chat_id,
          telegram_message_id: sendResult.messageId || null,
          status: dispatchStatus,
          error_code: sendResult.errorCode || null
        }).returning();
        recordedDispatches.push(disp);
      } catch (err) {
        failedCount++;
        try {
          const [disp] = await db.insert(deliveryOfferDispatches).values({
            delivery_id: id,
            driver_id: driver.id,
            telegram_chat_id: driver.telegram_chat_id,
            status: "FAILED",
            error_code: err.message || "DISPATCH_EXCEPTION"
          }).returning();
          recordedDispatches.push(disp);
        } catch (dbErr) {
        }
      }
    }
    return {
      delivery: updatedDelivery,
      dispatches: recordedDispatches,
      stats: { sent: sentCount, failed: failedCount }
    };
  }
  /**
   * Cancel Delivery: DRAFT -> CANCELLED or OFFERED -> CANCELLED
   * M3 Rule: ACCEPTED deliveries CANNOT be cancelled in this milestone.
   * If OFFERED was cancelled, notifies drivers who received SENT offer
   */
  async cancelDelivery(id, actor) {
    const delivery = await this.getDeliveryById(id);
    if (!delivery) throw new Error("DELIVERY_NOT_FOUND");
    if (delivery.status === "CANCELLED") {
      throw new Error("DELIVERY_ALREADY_CANCELLED");
    }
    if (delivery.status === "ACCEPTED") {
      throw new Error("CANNOT_CANCEL_ACCEPTED_DELIVERY");
    }
    const previousStatus = delivery.status;
    const [updatedDelivery] = await db.update(deliveries).set({ status: "CANCELLED" }).where(eq7(deliveries.id, id)).returning();
    await db.insert(deliveryEvents).values({
      delivery_id: id,
      event_type: "DELIVERY_CANCELLED",
      actor: actor || "ADMIN"
    });
    if (previousStatus === "OFFERED") {
      const dispatches = await db.select().from(deliveryOfferDispatches).where(eq7(deliveryOfferDispatches.delivery_id, id));
      for (const disp of dispatches) {
        if (disp.status === "SENT") {
          await telegramBot.sendDeliveryCancellation(disp.telegram_chat_id, id).catch((e) => {
            console.error(`[DeliveryService] Cancellation notify failed for chat ${disp.telegram_chat_id}:`, e.message);
          });
        }
      }
    }
    return updatedDelivery;
  }
  /**
   * M3: Exclusive and Atomic Delivery Acceptance
   * Guarantees at most ONE winning driver per delivery even under extreme concurrency.
   * Atomic decision enforced directly in PostgreSQL without in-memory locks.
   */
  async acceptDelivery(deliveryId, identifier) {
    let driver = null;
    if (identifier.telegramUserId) {
      driver = await driverService.getDriverByTelegramUserId(identifier.telegramUserId);
    } else if (identifier.driverId) {
      driver = await driverService.getDriverById(identifier.driverId);
    }
    if (!driver) {
      return {
        status: "REJECTED",
        error: "DRIVER_NOT_FOUND",
        message: "Motorista n\xE3o encontrado."
      };
    }
    if (driver.status === "PENDING") {
      return {
        status: "REJECTED",
        error: "DRIVER_PENDING",
        message: "Seu cadastro est\xE1 aguardando aprova\xE7\xE3o."
      };
    }
    if (driver.status === "BLOCKED") {
      return {
        status: "REJECTED",
        error: "DRIVER_BLOCKED",
        message: "Seu cadastro n\xE3o est\xE1 ativo no momento."
      };
    }
    if (driver.status !== "ACTIVE") {
      return {
        status: "REJECTED",
        error: "DRIVER_NOT_ACTIVE",
        message: "Motorista n\xE3o est\xE1 ativo."
      };
    }
    const delivery = await this.getDeliveryById(deliveryId);
    if (!delivery) {
      return {
        status: "REJECTED",
        error: "DELIVERY_NOT_FOUND",
        message: "Entrega n\xE3o encontrada."
      };
    }
    if (delivery.status === "CANCELLED") {
      return {
        status: "REJECTED",
        error: "DELIVERY_CANCELLED",
        message: "Esta entrega foi cancelada."
      };
    }
    const dispatches = await db.select().from(deliveryOfferDispatches).where(
      and5(
        eq7(deliveryOfferDispatches.delivery_id, deliveryId),
        eq7(deliveryOfferDispatches.driver_id, driver.id)
      )
    );
    const sentDispatch = dispatches.find((d) => d.status === "SENT");
    if (!sentDispatch) {
      return {
        status: "REJECTED",
        error: "NO_SENT_DISPATCH",
        message: "Voc\xEA n\xE3o recebeu a oferta para esta entrega."
      };
    }
    if (delivery.status === "ACCEPTED" && delivery.accepted_driver_id === driver.id) {
      return {
        status: "ALREADY_WON",
        delivery,
        message: "Esta entrega j\xE1 est\xE1 confirmada para voc\xEA."
      };
    }
    if (delivery.status === "ACCEPTED" && delivery.accepted_driver_id !== driver.id) {
      return {
        status: "LOST",
        message: "Esta entrega j\xE1 foi aceita por outro motorista."
      };
    }
    if (delivery.status !== "OFFERED") {
      return {
        status: "REJECTED",
        error: "DELIVERY_NOT_OFFERED",
        message: "Esta entrega n\xE3o est\xE1 dispon\xEDvel para aceite."
      };
    }
    const updateResults = await db.update(deliveries).set({
      status: "ACCEPTED",
      accepted_driver_id: driver.id,
      accepted_at: sql7`NOW()`
    }).where(
      and5(
        eq7(deliveries.id, deliveryId),
        eq7(deliveries.status, "OFFERED")
      )
    ).returning();
    if (updateResults.length > 0) {
      const wonDelivery = updateResults[0];
      await db.insert(deliveryEvents).values({
        delivery_id: deliveryId,
        event_type: "DELIVERY_ACCEPTED",
        actor: `DRIVER #${driver.id}`
      });
      this.invalidateOtherOffers(deliveryId, driver.id).catch((err) => {
        console.warn("[DeliveryService] Invalidate other offers error:", err.message);
      });
      return {
        status: "WON",
        delivery: wonDelivery,
        message: "Entrega aceita com sucesso."
      };
    }
    const freshDelivery = await this.getDeliveryById(deliveryId);
    if (freshDelivery?.status === "ACCEPTED" && freshDelivery.accepted_driver_id === driver.id) {
      return {
        status: "ALREADY_WON",
        delivery: freshDelivery,
        message: "Esta entrega j\xE1 est\xE1 confirmada para voc\xEA."
      };
    }
    if (freshDelivery?.status === "ACCEPTED") {
      return {
        status: "LOST",
        message: "Esta entrega j\xE1 foi aceita por outro motorista."
      };
    }
    return {
      status: "REJECTED",
      error: "DELIVERY_UNAVAILABLE",
      message: "Esta entrega n\xE3o est\xE1 mais dispon\xEDvel."
    };
  }
  /**
   * Helper to invalidate/update inline keyboard on other drivers' messages (UX improvement)
   */
  async invalidateOtherOffers(deliveryId, winningDriverId) {
    try {
      const otherDispatches = await db.select().from(deliveryOfferDispatches).where(
        and5(
          eq7(deliveryOfferDispatches.delivery_id, deliveryId),
          eq7(deliveryOfferDispatches.status, "SENT")
        )
      );
      for (const disp of otherDispatches) {
        if (disp.driver_id !== winningDriverId && disp.telegram_message_id) {
          await telegramBot.invalidateOfferMarkup(disp.telegram_chat_id, disp.telegram_message_id).catch(() => {
          });
        }
      }
    } catch (err) {
      console.warn("[DeliveryService.invalidateOtherOffers] Error:", err.message);
    }
  }
};
var deliveryService = new DeliveryService();
try {
  telegramBot?.setDeliveryService(deliveryService);
} catch {
}

// server.ts
init_routeService();
init_routeEditService();
init_referralService();
init_deliveryConfigService();
init_telegramBot();

// src/middleware/auth.ts
import { timingSafeEqual } from "crypto";

// src/lib/firebase-admin.ts
import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import fs2 from "fs";
import path2 from "path";
var firebaseConfig = {};
try {
  const configPath = path2.resolve(process.cwd(), "firebase-applet-config.json");
  if (fs2.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs2.readFileSync(configPath, "utf-8"));
  }
} catch (e) {
  console.warn("[firebase-admin] Failed to load firebase-applet-config.json:", e);
}
if (!getApps().length) {
  initializeApp({
    projectId: firebaseConfig.projectId || process.env.VITE_FIREBASE_PROJECT_ID
  });
}
var adminAuth = getAuth();

// src/db/users.ts
init_db();
init_schema();
async function getOrCreateUser(uid, email) {
  const result = await db.insert(users).values({
    uid,
    email
  }).onConflictDoUpdate({
    target: users.uid,
    set: {
      email
    }
  }).returning();
  return result[0];
}

// src/middleware/auth.ts
var MIN_KEY_LENGTH = 20;
function configuredAdminKey() {
  const key = String(process.env.ADMIN_API_KEY || "").trim();
  return key.length >= MIN_KEY_LENGTH ? key : null;
}
function adminEmails() {
  return new Set(
    String(process.env.ADMIN_EMAILS || "").split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter(Boolean)
  );
}
function sameSecret(given, expected) {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
var requireAdminAuth = async (req, res, next) => {
  const authHeader = String(req.headers.authorization || "");
  const adminKeyHeader = String(req.headers["x-admin-key"] || "").trim();
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const adminKey = configuredAdminKey();
  const keyCandidate = adminKeyHeader || (bearer && bearer.length < 200 ? bearer : "");
  if (adminKey && keyCandidate && sameSecret(keyCandidate, adminKey)) {
    req.user = { uid: "admin-cli", email: "admin@kantine.internal", isAdminKey: true };
    return next();
  }
  if (bearer) {
    let decoded;
    try {
      decoded = await adminAuth.verifyIdToken(bearer);
    } catch {
      return res.status(401).json({ error: "UNAUTHORIZED", message: "Sess\xE3o inv\xE1lida ou expirada. Entre novamente com o Google." });
    }
    const email = String(decoded.email || "").toLowerCase();
    const allowed = adminEmails();
    if (!allowed.size) {
      console.error("[auth] ADMIN_EMAILS n\xE3o configurada: nenhum login Google \xE9 aceito.");
      return res.status(503).json({ error: "ADMIN_EMAILS_NOT_CONFIGURED", message: "Configure ADMIN_EMAILS (e-mails autorizados) no servidor." });
    }
    if (!email || decoded.email_verified === false || !allowed.has(email)) {
      console.warn(`[auth] Login recusado para ${email || "conta sem e-mail"}`);
      return res.status(403).json({ error: "FORBIDDEN", message: `A conta ${email || ""} n\xE3o tem acesso ao painel administrativo.` });
    }
    req.user = decoded;
    await getOrCreateUser(decoded.uid, email).catch((e) => console.error("Failed to sync admin user record:", e));
    return next();
  }
  return res.status(401).json({ error: "UNAUTHORIZED", message: "Entre com o Google para acessar o painel." });
};

// server.ts
init_eligibility();

// src/server/takeatService.ts
init_db();
init_schema();
import { eq as eq8, and as and6, desc as desc6, sql as sql9 } from "drizzle-orm";
init_routeService();

// src/server/scheduleService.ts
init_db();
init_routeService();
import { sql as sql8 } from "drizzle-orm";
var OFFER_LEAD_MINUTES = () => {
  const n = Number(process.env.OFFER_LEAD_MINUTES);
  return Number.isFinite(n) && n >= 0 && n <= 24 * 60 ? n : 90;
};
var fmtBRT = (d) => d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
var iso = (v) => v ? new Date(v).toISOString() : null;
var tableReady = null;
function ensureScheduleTable() {
  if (!tableReady) {
    tableReady = (async () => {
      try {
        await db.execute(sql8`CREATE TABLE IF NOT EXISTS "route_schedules" (
          "route_id" integer PRIMARY KEY REFERENCES "routes"("id") ON DELETE CASCADE,
          "scheduled_for" timestamptz,
          "publish_at" timestamptz,
          "publish_error" text,
          "published_at" timestamptz,
          "updated_at" timestamptz DEFAULT now() NOT NULL
        )`);
        return true;
      } catch (e) {
        try {
          await db.execute(sql8`SELECT 1 FROM "route_schedules" LIMIT 1`);
          return true;
        } catch {
          console.error("[agendamento] tabela route_schedules indispon\xEDvel:", e?.message);
          tableReady = null;
          return false;
        }
      }
    })();
  }
  return tableReady;
}
function rowOf(r) {
  return {
    route_id: Number(r.route_id),
    scheduled_for: iso(r.scheduled_for),
    publish_at: iso(r.publish_at),
    publish_error: r.publish_error || null,
    published_at: iso(r.published_at)
  };
}
var rowsOf = (res) => Array.isArray(res) ? res : res?.rows || [];
var ScheduleService = class {
  /** Agendamentos das rotas informadas (falha aqui nunca derruba a listagem de rotas). */
  async getMany(routeIds) {
    const out = /* @__PURE__ */ new Map();
    const ids = routeIds.filter((n) => Number.isInteger(n) && n > 0);
    if (!ids.length || !await ensureScheduleTable()) return out;
    try {
      const res = await db.execute(
        sql8`SELECT * FROM "route_schedules" WHERE "route_id" IN (${sql8.join(ids.map((i) => sql8`${i}`), sql8`, `)})`
      );
      for (const r of rowsOf(res)) out.set(Number(r.route_id), rowOf(r));
    } catch (e) {
      console.warn("[agendamento] leitura falhou:", e?.message);
    }
    return out;
  }
  async get(routeId) {
    return (await this.getMany([routeId])).get(routeId) || null;
  }
  /** Acrescenta scheduled_for / publish_at / publish_error às rotas (para a tela). */
  async decorate(list) {
    const map = await this.getMany(list.map((r) => r.id));
    return list.map((r) => {
      const s = map.get(r.id);
      return s ? { ...r, scheduled_for: s.scheduled_for, publish_at: s.publish_at, publish_error: s.publish_error, schedule_published_at: s.published_at } : r;
    });
  }
  /** Define (ou remove, com null) a data/hora de entrega. Ajusta a publicação programada, se houver. */
  async setScheduledFor(routeId, when) {
    if (!await ensureScheduleTable()) throw new Error("SCHEDULE_UNAVAILABLE");
    const current = await this.get(routeId);
    const publishAt = when && current?.publish_at ? new Date(when.getTime() - OFFER_LEAD_MINUTES() * 6e4) : null;
    await db.execute(sql8`
      INSERT INTO "route_schedules" ("route_id", "scheduled_for", "publish_at", "publish_error", "updated_at")
      VALUES (${routeId}, ${when ? when.toISOString() : null}, ${publishAt ? publishAt.toISOString() : null}, NULL, now())
      ON CONFLICT ("route_id") DO UPDATE SET
        "scheduled_for" = EXCLUDED."scheduled_for",
        "publish_at" = EXCLUDED."publish_at",
        "publish_error" = NULL,
        "updated_at" = now()`);
    if (when) await routeService.setFinalDeadlineText(routeId, `Entregar \xE0s ${fmtBRT(when)}`).catch(() => {
    });
    return await this.get(routeId);
  }
  /**
   * Programa a publicação da oferta (entrega − antecedência). Se esse horário já passou,
   * publica na hora. A rota precisa estar em rascunho e ter data/hora de entrega.
   */
  async schedulePublish(routeId, actor) {
    const route = await routeService.getRouteById(routeId);
    if (!route) throw new Error("ROUTE_NOT_FOUND");
    if (route.status !== "DRAFT") throw new Error("ROUTE_NOT_DRAFT");
    const s = await this.get(routeId);
    if (!s?.scheduled_for) throw new Error("SCHEDULED_FOR_REQUIRED");
    const delivery = new Date(s.scheduled_for);
    if (delivery.getTime() < Date.now()) throw new Error("SCHEDULED_FOR_IN_PAST");
    const publishAt = new Date(delivery.getTime() - OFFER_LEAD_MINUTES() * 6e4);
    if (publishAt.getTime() <= Date.now()) {
      await routeService.publishRoute(routeId, actor);
      await db.execute(sql8`UPDATE "route_schedules" SET "publish_at" = NULL, "publish_error" = NULL,
        "published_at" = now(), "updated_at" = now() WHERE "route_id" = ${routeId}`);
      return { schedule: await this.get(routeId), publishedNow: true };
    }
    await db.execute(sql8`UPDATE "route_schedules" SET "publish_at" = ${publishAt.toISOString()}, "publish_error" = NULL,
      "updated_at" = now() WHERE "route_id" = ${routeId}`);
    await routeService.logRouteEvent(routeId, "ROUTE_UPDATED", actor, `Oferta agendada para ${fmtBRT(publishAt)} (entrega ${fmtBRT(delivery)}).`).catch(() => {
    });
    return { schedule: await this.get(routeId), publishedNow: false };
  }
  async unschedulePublish(routeId, actor) {
    if (!await ensureScheduleTable()) throw new Error("SCHEDULE_UNAVAILABLE");
    await db.execute(sql8`UPDATE "route_schedules" SET "publish_at" = NULL, "publish_error" = NULL, "updated_at" = now()
      WHERE "route_id" = ${routeId}`);
    await routeService.logRouteEvent(routeId, "ROUTE_UPDATED", actor, "Oferta agendada desfeita (volta a ser rascunho comum).").catch(() => {
    });
    return this.get(routeId);
  }
  /**
   * Publica as ofertas cujo horário chegou. Cada rota é "reservada" com um UPDATE atômico,
   * então duas execuções simultâneas (timer interno + chamada externa) não publicam em dobro.
   */
  async tick() {
    const result = { due: 0, published: 0, failed: 0 };
    if (!await ensureScheduleTable()) return result;
    const dueRes = await db.execute(
      sql8`SELECT "route_id", "publish_at" FROM "route_schedules" WHERE "publish_at" IS NOT NULL AND "publish_at" <= now() ORDER BY "publish_at" LIMIT 20`
    );
    for (const r of rowsOf(dueRes)) {
      result.due++;
      const id = Number(r.route_id);
      const claimed = rowsOf(
        await db.execute(sql8`UPDATE "route_schedules" SET "publish_at" = NULL, "updated_at" = now()
          WHERE "route_id" = ${id} AND "publish_at" IS NOT NULL RETURNING "route_id"`)
      );
      if (!claimed.length) continue;
      try {
        const route = await routeService.getRouteById(id);
        if (!route || route.status !== "DRAFT") continue;
        await routeService.publishRoute(id, "AGENDADOR");
        await db.execute(sql8`UPDATE "route_schedules" SET "published_at" = now(), "publish_error" = NULL, "updated_at" = now()
          WHERE "route_id" = ${id}`);
        result.published++;
      } catch (e) {
        result.failed++;
        const msg = String(e?.message || e).slice(0, 300);
        const s = await this.get(id).catch(() => null);
        const stillTime = s?.scheduled_for && Date.parse(s.scheduled_for) > Date.now();
        await db.execute(sql8`UPDATE "route_schedules" SET
          "publish_at" = ${stillTime ? sql8`now() + interval '5 minutes'` : sql8`NULL`},
          "publish_error" = ${msg}, "updated_at" = now() WHERE "route_id" = ${id}`).catch(() => {
        });
        console.warn(`[agendamento] rota #${id} n\xE3o publicada: ${msg}`);
      }
    }
    return result;
  }
};
var scheduleService = new ScheduleService();

// src/server/takeatService.ts
function vehicleOf(order) {
  const raw = order?.raw_payload || {};
  const p = raw?.data || raw?.order || raw;
  const v = String(p?.vehicle || "").toUpperCase();
  const vehicle_category = v === "CAR" || v === "MOTO" ? v : null;
  return { vehicle_category, vehicle_reason: vehicle_category ? String(p?.vehicleReason || "") || null : null };
}
var withVehicle = (o) => ({ ...o, ...vehicleOf(o) });
function dropoffCoordsOf(raw) {
  const p = raw?.data || raw?.order || raw || {};
  const d = p?.delivery || p?.endereco || p?.deliveryAddress || p?.address || {};
  const lat = Number(d?.latitude ?? d?.lat);
  const lng = Number(d?.longitude ?? d?.lng ?? d?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 && lng === 0) return void 0;
  if (lat < -19.6 || lat > -18.4 || lng < -48.9 || lng > -47.6) return void 0;
  return { lat, lng };
}
var TakeatService = class {
  /**
   * Retorna todas as configurações de lojas cadastradas (Matriz e Vinhedos)
   */
  async getAllConfigs() {
    const rows = await db.select().from(takeatConfigs);
    let matriz = rows.find((r) => r.store_key === "MATRIZ");
    let vinhedos = rows.find((r) => r.store_key === "VINHEDOS");
    if (!matriz) {
      const [insertedMatriz] = await db.insert(takeatConfigs).values({
        store_key: "MATRIZ",
        store_name: "Kantine Matriz",
        store_id: "kantine-matriz",
        default_pickup_preset: "MATRIZ",
        auto_calculate_freight: true,
        preferred_modality: "MOTO",
        is_active: true
      }).returning();
      matriz = insertedMatriz;
    }
    if (!vinhedos) {
      const [insertedVinhedos] = await db.insert(takeatConfigs).values({
        store_key: "VINHEDOS",
        store_name: "Kantine Vinhedos",
        store_id: "kantine-vinhedos",
        default_pickup_preset: "VINHEDOS",
        auto_calculate_freight: true,
        preferred_modality: "MOTO",
        is_active: true
      }).returning();
      vinhedos = insertedVinhedos;
    }
    return {
      MATRIZ: matriz,
      VINHEDOS: vinhedos
    };
  }
  /**
   * Retorna a configuração de uma loja específica (MATRIZ ou VINHEDOS)
   */
  async getConfig(storeKey = "MATRIZ") {
    const all = await this.getAllConfigs();
    return all[storeKey] || all.MATRIZ;
  }
  /**
   * Salva configurações e chaves de API de uma loja específica (Matriz ou Vinhedos)
   */
  async saveConfig(storeKey, data) {
    const normalizedKey = storeKey === "VINHEDOS" ? "VINHEDOS" : "MATRIZ";
    const current = await this.getConfig(normalizedKey);
    const updatePayload = {
      updated_at: /* @__PURE__ */ new Date()
    };
    if (data.api_key !== void 0) updatePayload.api_key = data.api_key ? data.api_key.trim() : null;
    if (data.webhook_secret !== void 0) updatePayload.webhook_secret = data.webhook_secret ? data.webhook_secret.trim() : null;
    if (data.store_id !== void 0) updatePayload.store_id = data.store_id ? data.store_id.trim() : null;
    if (data.store_name !== void 0) updatePayload.store_name = data.store_name ? data.store_name.trim() : current.store_name;
    if (data.default_pickup_preset !== void 0) updatePayload.default_pickup_preset = data.default_pickup_preset;
    if (data.auto_calculate_freight !== void 0) updatePayload.auto_calculate_freight = Boolean(data.auto_calculate_freight);
    if (data.preferred_modality !== void 0) updatePayload.preferred_modality = data.preferred_modality;
    if (data.notification_sound_enabled !== void 0) updatePayload.notification_sound_enabled = Boolean(data.notification_sound_enabled);
    if (data.is_active !== void 0) updatePayload.is_active = Boolean(data.is_active);
    const [updated] = await db.update(takeatConfigs).set(updatePayload).where(eq8(takeatConfigs.id, current.id)).returning();
    return updated;
  }
  /**
   * Identifica e normaliza o bairro de Uberlândia a partir do texto do Takeat
   */
  matchUberlandiaNeighborhood(rawAddress, rawNeighborhood) {
    const candidates = [rawNeighborhood || "", rawAddress || ""];
    for (const text2 of candidates) {
      if (!text2) continue;
      const normalized = normalizeName(text2);
      for (const record of UBERLANDIA_70_NEIGHBORHOODS) {
        if (normalized === record.normalized || normalized.includes(record.normalized)) {
          return record.name;
        }
      }
    }
    if (rawNeighborhood && rawNeighborhood.trim()) {
      return rawNeighborhood.trim();
    }
    return "Centro";
  }
  /**
   * Calcula o frete preliminar pelo Motor de Fretes da Kantine considerando a loja de origem
   */
  calculateOrderFreight(destinationNeighborhood, destinationAddress, pickupPresetKey = "MATRIZ", vehicleCategory = "MOTO", dropoffCoords) {
    const preset = PICKUP_PRESETS[pickupPresetKey] || PICKUP_PRESETS.MATRIZ;
    const stopInput = {
      sequence: 1,
      destination_address: destinationAddress,
      destination_neighborhood: destinationNeighborhood,
      is_horizontal_condo: false,
      // Endereço exato (quando o Takeat informa); sem ele, o motor usa o centro do bairro
      ...dropoffCoords ? { dropoff_coords: dropoffCoords } : {}
    };
    const calculation = calculateRoutePricing(
      vehicleCategory,
      {
        name: preset.name,
        address: preset.address,
        coords: preset.coords
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
  async processIncomingWebhook(rawPayload, explicitStoreKey) {
    const allConfigs = await this.getAllConfigs();
    const payload = rawPayload?.data || rawPayload?.order || rawPayload?.body || rawPayload;
    let storeKey = "MATRIZ";
    const explicitUpper = explicitStoreKey?.toUpperCase();
    if (explicitUpper === "VINHEDOS") {
      storeKey = "VINHEDOS";
    } else if (explicitUpper === "MATRIZ") {
      storeKey = "MATRIZ";
    } else {
      const incomingStoreId = String(
        payload?.store_id || payload?.storeId || payload?.merchantId || payload?.merchant_id || payload?.unit_id || payload?.unitId || payload?.slug || rawPayload?.store_id || rawPayload?.storeId || ""
      ).toLowerCase();
      if (allConfigs.VINHEDOS.store_id && incomingStoreId === allConfigs.VINHEDOS.store_id.toLowerCase() || incomingStoreId.includes("vinhedos") || incomingStoreId.includes("vinhedo")) {
        storeKey = "VINHEDOS";
      } else {
        storeKey = "MATRIZ";
      }
    }
    const config = allConfigs[storeKey];
    await db.update(takeatConfigs).set({ last_webhook_received_at: /* @__PURE__ */ new Date() }).where(eq8(takeatConfigs.id, config.id));
    const orderId = String(
      payload?.id || payload?.orderId || payload?.order_id || payload?.codigo || payload?.code || Date.now()
    ).trim();
    const displayCode = String(
      payload?.displayId || payload?.code || payload?.numero || payload?.orderNumber || orderId.slice(-4)
    ).replace(/^#/, "");
    const displayId = `#${displayCode}`;
    const event = String(rawPayload?.event || payload?.event || "");
    if (event === "order.canceled") {
      const [existing] = await db.select().from(takeatOrders).where(eq8(takeatOrders.takeat_order_id, orderId)).limit(1);
      if (!existing) throw new Error(`Pedido ${orderId} n\xE3o encontrado para cancelar.`);
      let routeCanceled = !existing.created_route_id;
      if (existing.created_route_id) {
        const route = await routeService.getRouteById(existing.created_route_id);
        if (!route || route.status === "CANCELLED") routeCanceled = true;
        else if ((route.status === "DRAFT" || route.status === "OFFERED") && !route.accepted_driver_id) {
          await routeService.cancelRoute(route.id, "TAKEAT", `Pedido ${existing.display_id} cancelado no Takeat`);
          routeCanceled = true;
        }
      }
      if (routeCanceled && (existing.status === "PENDING_COURIER" || existing.status === "IN_ROUTE")) {
        const [updated] = await db.update(takeatOrders).set({ status: "DISMISSED" }).where(eq8(takeatOrders.id, existing.id)).returning();
        return { order: updated, action: "CANCELED", storeKey };
      }
      console.warn(`[Takeat] Pedido ${existing.display_id} cancelado no Takeat, mas a rota #${existing.created_route_id ?? "-"} j\xE1 tem entregador (${existing.status}): avise o entregador.`);
      return {
        order: existing,
        action: "IGNORED",
        storeKey,
        reason: `Cancelado no Takeat, mas j\xE1 est\xE1 ${existing.status}: avise o entregador.`
      };
    }
    const customer = payload?.customer || payload?.cliente || {};
    const customerName = String(
      customer?.name || customer?.nome || payload?.customerName || payload?.nome_cliente || "Cliente Takeat"
    ).trim();
    const customerPhone = String(
      customer?.phone || customer?.telefone || customer?.mobile || payload?.customerPhone || ""
    ).trim() || null;
    const delivery = payload?.delivery || payload?.endereco || payload?.deliveryAddress || payload?.address || {};
    const street = delivery?.street || delivery?.rua || delivery?.logradouro || delivery?.address || "";
    const number = delivery?.number || delivery?.numero || "";
    const complement = delivery?.complement || delivery?.complemento || "";
    const rawNeighborhood = delivery?.neighborhood || delivery?.bairro || "";
    const city = delivery?.city || delivery?.cidade || "Uberl\xE2ndia";
    let formattedAddress = "";
    if (street && number) {
      formattedAddress = `${street}, ${number}${complement ? ` - ${complement}` : ""}`;
    } else if (delivery?.formattedAddress) {
      formattedAddress = delivery.formattedAddress;
    } else if (street) {
      formattedAddress = `${street}${complement ? ` - ${complement}` : ""}`;
    } else {
      formattedAddress = "Endere\xE7o n\xE3o informado";
    }
    const matchedNeighborhood = this.matchUberlandiaNeighborhood(formattedAddress, rawNeighborhood);
    const itemsRaw = payload?.items || payload?.itens || payload?.products || [];
    let itemsSummary = "";
    const itemsJson = [];
    if (Array.isArray(itemsRaw) && itemsRaw.length > 0) {
      const summaryParts = [];
      for (const item of itemsRaw) {
        const qty = item?.quantity || item?.quantidade || item?.qty || 1;
        const name = item?.name || item?.nome || item?.title || "Item";
        summaryParts.push(`${qty}x ${name}`);
        itemsJson.push({
          name,
          quantity: qty,
          unit_price: item?.price || item?.preco || 0,
          total_price: (item?.price || item?.preco || 0) * qty,
          notes: item?.notes || item?.observacao || null
        });
      }
      itemsSummary = summaryParts.join(", ");
    } else if (typeof payload?.notes === "string") {
      itemsSummary = payload.notes;
    }
    const orderTotal = payload?.total || payload?.orderAmount || payload?.valor_total || payload?.totalAmount || 0;
    const deliveryFeeCharged = payload?.deliveryFee || payload?.taxa_entrega || delivery?.fee || 0;
    const payments = payload?.payments || payload?.pagamento || payload?.payment || {};
    let paymentMethod = "PIX";
    let changeFor = null;
    if (Array.isArray(payments) && payments.length > 0) {
      paymentMethod = payments[0]?.method || payments[0]?.tipo || "PIX";
      if (payments[0]?.changeFor) changeFor = Number(payments[0].changeFor);
    } else if (typeof payments === "object" && payments?.method) {
      paymentMethod = payments.method;
      if (payments.changeFor) changeFor = Number(payments.changeFor);
    } else if (payload?.paymentMethod) {
      paymentMethod = payload.paymentMethod;
    }
    const pickupPresetKey = storeKey === "VINHEDOS" ? "VINHEDOS" : config.default_pickup_preset || "MATRIZ";
    const incomingVehicle = String(payload?.vehicle || "").toUpperCase();
    const vehicleCategory = incomingVehicle === "CAR" || incomingVehicle === "MOTO" ? incomingVehicle : null;
    const modality = vehicleCategory || config.preferred_modality || "MOTO";
    const freightCalc = this.calculateOrderFreight(
      matchedNeighborhood,
      formattedAddress,
      pickupPresetKey,
      modality,
      dropoffCoordsOf(rawPayload)
    );
    const calculatedFreightValue = freightCalc.route_operational_total.toFixed(2);
    const storeIdVal = payload?.store_id || payload?.storeId || config.store_id || null;
    const existingRows = await db.select().from(takeatOrders).where(eq8(takeatOrders.takeat_order_id, orderId)).limit(1);
    if (existingRows.length > 0) {
      const existing = existingRows[0];
      if (existing.status === "IN_ROUTE" || existing.status === "DELIVERED") {
        return {
          order: existing,
          action: "IGNORED",
          storeKey,
          reason: `Pedido j\xE1 se encontra com status ${existing.status}`
        };
      }
      const [updated] = await db.update(takeatOrders).set({
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
        raw_payload: rawPayload
      }).where(eq8(takeatOrders.id, existing.id)).returning();
      return {
        order: updated,
        action: "UPDATED",
        storeKey
      };
    }
    const [inserted] = await db.insert(takeatOrders).values({
      takeat_order_id: orderId,
      store_key: storeKey,
      store_id: storeIdVal,
      display_id: displayId,
      customer_name: customerName,
      customer_phone: customerPhone,
      destination_address: formattedAddress,
      destination_neighborhood: matchedNeighborhood,
      destination_city: city,
      order_items_summary: itemsSummary || "Pedido Kantine Delivery",
      order_items_json: itemsJson,
      order_total: Number(orderTotal) > 0 ? Number(orderTotal).toFixed(2) : "0.00",
      delivery_fee_charged: Number(deliveryFeeCharged) > 0 ? Number(deliveryFeeCharged).toFixed(2) : "0.00",
      payment_method: paymentMethod,
      change_for: changeFor ? changeFor.toFixed(2) : null,
      pickup_preset: pickupPresetKey,
      status: "PENDING_COURIER",
      calculated_freight_value: calculatedFreightValue,
      calculated_freight_details: freightCalc,
      raw_payload: rawPayload,
      accepted_at: /* @__PURE__ */ new Date()
    }).returning();
    let order = inserted;
    let draftError;
    try {
      order = (await this.convertOrderToRoute(order.id, { offerNow: false, asDraftRoute: true })).order;
    } catch (e) {
      draftError = String(e?.message || e);
      console.warn(`[Takeat] Pedido ${displayId}: n\xE3o foi poss\xEDvel criar o rascunho de rota (${draftError}). Fica aguardando na aba Takeat.`);
    }
    return {
      order: withVehicle(order),
      action: "CREATED",
      storeKey,
      draftError
    };
  }
  /**
   * Lista pedidos do Takeat com filtros por status e por loja
   */
  async getOrders(statusFilter, storeKeyFilter) {
    const conditions = [];
    if (statusFilter && statusFilter !== "ALL") {
      conditions.push(eq8(takeatOrders.status, statusFilter));
    }
    if (storeKeyFilter && storeKeyFilter !== "ALL") {
      conditions.push(eq8(takeatOrders.store_key, storeKeyFilter));
    }
    let query = db.select().from(takeatOrders);
    if (conditions.length === 1) {
      const rows2 = await query.where(conditions[0]).orderBy(desc6(takeatOrders.created_at)).limit(60);
      return rows2.map(withVehicle);
    } else if (conditions.length > 1) {
      const rows2 = await query.where(and6(...conditions)).orderBy(desc6(takeatOrders.created_at)).limit(60);
      return rows2.map(withVehicle);
    }
    const rows = await query.orderBy(desc6(takeatOrders.created_at)).limit(60);
    return rows.map(withVehicle);
  }
  /**
   * Retorna a quantidade de pedidos aguardando entregador (PENDING_COURIER)
   */
  async getPendingCount() {
    const rows = await db.select({
      store_key: takeatOrders.store_key,
      count: sql9`count(*)`
    }).from(takeatOrders).where(eq8(takeatOrders.status, "PENDING_COURIER")).groupBy(takeatOrders.store_key);
    let matrizCount = 0;
    let vinhedosCount = 0;
    for (const r of rows) {
      if (r.store_key === "VINHEDOS") {
        vinhedosCount += Number(r.count || 0);
      } else {
        matrizCount += Number(r.count || 0);
      }
    }
    return {
      total: matrizCount + vinhedosCount,
      matriz: matrizCount,
      vinhedos: vinhedosCount
    };
  }
  /**
   * Transforma um pedido do Takeat em uma Rota (Rascunho ou Oferta Ativa)
   */
  async convertOrderToRoute(orderId, options) {
    const rows = await db.select().from(takeatOrders).where(eq8(takeatOrders.id, orderId)).limit(1);
    if (rows.length === 0) {
      throw new Error("TAKEAT_ORDER_NOT_FOUND");
    }
    const order = rows[0];
    const config = await this.getConfig(order.store_key || "MATRIZ");
    const modality = vehicleOf(order).vehicle_category || options?.modality || config.preferred_modality || "MOTO";
    const pickupPresetKey = options?.pickupPreset || order.pickup_preset || (order.store_key === "VINHEDOS" ? "VINHEDOS" : "MATRIZ");
    const pickupPreset = PICKUP_PRESETS[pickupPresetKey] || PICKUP_PRESETS.MATRIZ;
    const freightCalc = this.calculateOrderFreight(
      order.destination_neighborhood,
      order.destination_address,
      pickupPresetKey,
      modality,
      dropoffCoordsOf(order.raw_payload)
    );
    const storeLabel = order.store_key === "VINHEDOS" ? "Vinhedos" : "Matriz";
    const channelLabel = order.raw_payload?.channel === "site" ? "Pedido do site" : "Pedido Takeat";
    const cargoDescription = `${channelLabel} ${order.display_id} (${storeLabel}) \u2014 ${order.customer_name}${order.order_items_summary ? ` | ${order.order_items_summary}` : ""}`;
    const createdRoute = await routeService.createDraft(
      {
        pickup_type: "REGISTERED",
        pickup_location_id: await this.pickupLocationId(pickupPresetKey === "VINHEDOS" ? "VINHEDOS" : "MATRIZ"),
        final_deadline: this.routeDeadline(order),
        // Mesmo critério do simulador: valor da corrida = preço da tabela (antes era só o repasse de 90%)
        total_fee: freightCalc.route_operational_total.toFixed(2),
        accepted_vehicle_types: modality === "CAR" ? ["CAR"] : ["MOTO", "MOTO_WITH_BAG"],
        stops: [
          {
            destination_address: order.destination_address,
            destination_neighborhood: order.destination_neighborhood,
            cargo_description: cargoDescription,
            is_horizontal_condo: false,
            delivery_mode: "IN_PERSON",
            observations: this.stopObservations(order, storeLabel)
          }
        ]
      },
      "TAKEAT_ORDER"
    );
    const scheduledTo = order.raw_payload?.scheduledTo;
    if (scheduledTo && Date.parse(scheduledTo) > Date.now()) {
      await scheduleService.setScheduledFor(createdRoute.id, new Date(scheduledTo)).catch(
        (e) => console.warn(`[Takeat] rota #${createdRoute.id}: data de entrega n\xE3o registrada (${e?.message})`)
      );
    }
    if (options?.offerNow) {
      try {
        await routeService.publishRoute(createdRoute.id, "TAKEAT_AUTO_DISPATCH");
      } catch (e) {
        console.warn(`[TakeatService] Failed to dispatch instant offer: ${e.message}`);
      }
    }
    const [updatedOrder] = await db.update(takeatOrders).set({
      created_route_id: createdRoute.id,
      status: options?.offerNow || options?.asDraftRoute ? "IN_ROUTE" : "PENDING_COURIER",
      dispatched_at: options?.offerNow ? /* @__PURE__ */ new Date() : null
    }).where(eq8(takeatOrders.id, order.id)).returning();
    return {
      route: createdRoute,
      order: updatedOrder
    };
  }
  /** Local de coleta cadastrado da unidade (pelo nome: "Matriz"/"Vinhedos"); se não achar, os ids padrão 1/2. */
  async pickupLocationId(store) {
    const fallback = store === "VINHEDOS" ? 2 : 1;
    try {
      const all = await routeService.getPickupLocations();
      const active = all.filter((p) => p.active !== false);
      const want = store === "VINHEDOS" ? /vinhedo/i : /matriz/i;
      const byName = active.find((p) => want.test(String(p.name || "")));
      if (byName) return Number(byName.id);
      if (active.some((p) => Number(p.id) === fallback)) return fallback;
      if (store === "MATRIZ" && active.length === 1) return Number(active[0].id);
    } catch {
    }
    return fallback;
  }
  /** Prazo da rota: horário agendado do Takeat, se houver; senão o padrão de 50 min. */
  routeDeadline(order) {
    const when = order.raw_payload?.scheduledTo;
    if (!when || !Number.isFinite(Date.parse(when))) return "50 min";
    return `Agendado ${new Date(when).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`;
  }
  /** Observações da parada para o entregador (cobrança, troco, referência, horário agendado). */
  stopObservations(order, storeLabel) {
    const raw = order.raw_payload || {};
    if (raw?.source !== "kantine-zelo-bridge") {
      return `Originado do Takeat (${storeLabel}). Valor pedido: R$ ${order.order_total || "0,00"}. Pagto: ${order.payment_method || "PIX"}`;
    }
    const d = raw.delivery || {};
    const brl = (n) => `R$ ${Number(n || 0).toFixed(2).replace(".", ",")}`;
    const when = raw.scheduledTo ? new Date(raw.scheduledTo).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "";
    return [
      `${raw.channel === "site" ? "Site" : "Takeat"} ${order.display_id} (${storeLabel})`,
      vehicleOf(order).vehicle_category === "CAR" ? `CARRO${vehicleOf(order).vehicle_reason ? ` (${vehicleOf(order).vehicle_reason})` : ""}` : "",
      raw.isPaid ? `PAGO (${brl(raw.total)})` : String(order.payment_method || `Cobrar ${brl(raw.amountToCollect)} na entrega`).toUpperCase(),
      order.change_for && Number(order.change_for) > 0 ? `Troco para ${brl(order.change_for)}` : "",
      d.reference ? `Ref.: ${d.reference}` : "",
      d.zipCode ? `CEP ${d.zipCode}` : "",
      when ? `Agendado: ${when}` : "",
      order.customer_phone ? `Tel.: ${order.customer_phone}` : "",
      raw.notes ? `Obs.: ${raw.notes}` : ""
    ].filter(Boolean).join(" \xB7 ");
  }
  /**
   * Descarta / dispensa pedido
   */
  async dismissOrder(orderId) {
    const [updated] = await db.update(takeatOrders).set({ status: "DISMISSED" }).where(eq8(takeatOrders.id, orderId)).returning();
    if (!updated) throw new Error("ORDER_NOT_FOUND");
    return updated;
  }
  /**
   * Exclui pedido
   */
  async deleteOrder(orderId) {
    await db.delete(takeatOrders).where(eq8(takeatOrders.id, orderId));
    return true;
  }
  /**
   * Simula um pedido de teste realista vindo do Takeat para Matriz ou Vinhedos
   */
  async simulateTestOrder(preset) {
    const storeKey = preset?.storeKey || (Math.random() > 0.5 ? "VINHEDOS" : "MATRIZ");
    const matrizNeighborhoods = ["Fundinho", "Martins", "Tibery", "Centro", "Osvaldo Rezende", "Daniel Fonseca"];
    const vinhedosNeighborhoods = ["Santa M\xF4nica", "Granada", "Saraiva", "Kara\xEDba", "Jardim Inconfid\xEAncia", "Pampulha"];
    const candidateNeighborhoods = storeKey === "VINHEDOS" ? vinhedosNeighborhoods : matrizNeighborhoods;
    const selectedNeighborhood = preset?.neighborhood || candidateNeighborhoods[Math.floor(Math.random() * candidateNeighborhoods.length)];
    const sampleStreets = {
      "Fundinho": "Rua Tiradentes, 210",
      "Martins": "Rua Goi\xE1s, 520 - Apto 302",
      "Tibery": "Av. Floriano Peixoto, 1420",
      "Centro": "Av. Afonso Pena, 890",
      "Osvaldo Rezende": "Rua Arthur Bernardes, 310",
      "Daniel Fonseca": "Rua General Os\xF3rio, 145",
      "Santa M\xF4nica": "Rua dos Cravos, 350",
      "Granada": "Av. Dr. Vicente Salles, 185",
      "Saraiva": "Rua Silva Jardim, 89",
      "Kara\xEDba": "Alameda dos Ip\xEAs, 720",
      "Jardim Inconfid\xEAncia": "Rua das Cam\xE9lias, 102",
      "Pampulha": "Av. dos Munic\xEDpios, 610"
    };
    const street = sampleStreets[selectedNeighborhood] || "Av. Floriano Peixoto, 1420";
    const sampleItems = [
      "1x Torta Holandesa (Fatia), 1x Cappuccino Avel\xE3",
      "2x Quiche Lorraine, 1x Suco Natural de Laranja",
      "1x Bolo Red Velvet Pequeno, 2x Croissant Tradicional",
      "1x Cesta Caf\xE9 Kantine Especial",
      "2x Empada de Frango com Catupiry, 1x Caf\xE9 Expresso"
    ];
    const itemsSummary = preset?.items || sampleItems[Math.floor(Math.random() * sampleItems.length)];
    const customerNames = ["Mariana Siqueira", "Lucas Rezende", "Ana Paula Castro", "Rodrigo Mendes", "Carla Fernandes", "Bruno Alvarenga"];
    const customerName = preset?.customerName || customerNames[Math.floor(Math.random() * customerNames.length)];
    const orderNumber = Math.floor(1030 + Math.random() * 890);
    const orderId = `TK-${storeKey === "VINHEDOS" ? "VIN" : "MAT"}-${orderNumber}`;
    const displayId = `#${orderNumber}`;
    const total = preset?.total || Number((45 + Math.random() * 65).toFixed(2));
    const deliveryFee = 10;
    const allConfigs = await this.getAllConfigs();
    const storeConfig = allConfigs[storeKey];
    const result = await this.processIncomingWebhook(
      {
        id: orderId,
        code: orderNumber,
        orderNumber,
        store_id: storeConfig.store_id || (storeKey === "VINHEDOS" ? "kantine-vinhedos" : "kantine-matriz"),
        customer: {
          name: customerName,
          phone: "(34) 99842-" + Math.floor(1e3 + Math.random() * 9e3)
        },
        delivery: {
          address: street,
          neighborhood: selectedNeighborhood,
          city: "Uberl\xE2ndia",
          fee: deliveryFee
        },
        items: [
          { name: itemsSummary, quantity: 1, price: total }
        ],
        total,
        deliveryFee,
        payments: [
          { method: "PIX", total }
        ]
      },
      storeKey
    );
    return { ...result.order, draft_error: result.draftError || null };
  }
  /**
   * Consulta ativa à API REST da Takeat usando a Chave de REST (Bearer Token)
   */
  async syncOrdersFromRestApi(storeKey = "MATRIZ") {
    const config = await this.getConfig(storeKey);
    if (!config.api_key) {
      throw new Error("CHAVE_REST_NAO_CONFIGURADA: Cole e salve a Chave de REST gerada no Takeat antes de sincronizar.");
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
      `https://api.takeat.app/v1/merchants/${config.store_id || ""}/orders`
    ];
    let remoteOrders = [];
    let lastStatus = 0;
    let lastResponseSnippet = "";
    for (const url of possibleEndpoints) {
      const headerVariants = [
        {
          "Authorization": `Bearer ${config.api_key.trim()}`,
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        {
          "x-api-key": config.api_key.trim(),
          "Accept": "application/json",
          "Content-Type": "application/json"
        }
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
              lastResponseSnippet = "200_EMPTY";
            }
          } else {
            const errText = await response.text().catch(() => "");
            if (errText) lastResponseSnippet = errText.slice(0, 150);
          }
        } catch (err) {
          console.warn(`[Takeat REST sync] Error fetching ${url}: ${err.message}`);
        }
      }
      if (remoteOrders.length > 0) break;
    }
    const processedOrders = [];
    for (const remote of remoteOrders) {
      const res = await this.processIncomingWebhook(remote, storeKey);
      processedOrders.push(res.order);
    }
    return {
      success: true,
      syncedCount: processedOrders.length,
      orders: processedOrders,
      message: processedOrders.length > 0 ? `${processedOrders.length} pedido(s) da ${storeKey === "VINHEDOS" ? "Vinhedos" : "Matriz"} importado(s) com sucesso via API REST!` : lastStatus === 401 || lastStatus === 403 ? "Chave REST conectada, mas o Takeat retornou autoriza\xE7\xE3o pendente. Verifique se a chave tem permiss\xE3o de leitura de pedidos." : "Conex\xE3o com a API REST efetuada com sucesso! Nenhum pedido com entrega pendente no momento."
    };
  }
};
var takeatService = new TakeatService();

// server.ts
init_db();

// src/server/mercadoPagoService.ts
init_pixValidation();
var MercadoPagoService = class {
  getAccessToken() {
    return (process.env.MERCADO_PAGO_ACCESS_TOKEN || "").trim() || null;
  }
  isConfigured() {
    const token = this.getAccessToken();
    return Boolean(token && token.length > 10);
  }
  /**
   * Obtém informações da conta Mercado Pago autenticada pelo Access Token
   */
  async getAccountInfo() {
    const token = this.getAccessToken();
    if (!token) {
      return {
        configured: false,
        error: "MERCADO_PAGO_ACCESS_TOKEN n\xE3o configurado no servidor."
      };
    }
    try {
      const res = await fetch("https://api.mercadopago.com/v1/users/me", {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json"
        }
      });
      if (!res.ok) {
        const text2 = await res.text();
        return {
          configured: true,
          error: `Erro ao autenticar no Mercado Pago (${res.status}): ${text2}`
        };
      }
      const data = await res.json();
      return {
        configured: true,
        user_id: data.id,
        nickname: data.nickname,
        email: data.email,
        site_id: data.site_id
      };
    } catch (err) {
      return {
        configured: true,
        error: `Falha de conex\xE3o com a API do Mercado Pago: ${err.message}`
      };
    }
  }
  /**
   * Normaliza tipo e valor da chave Pix para o padrão esperado pelo Mercado Pago
   */
  formatReceiverPix(keyType, keyValue) {
    const upperType = (keyType || "").toUpperCase().trim();
    const rawVal = (keyValue || "").trim();
    if (upperType === "CPF") {
      const norm2 = validateAndNormalizeCpf(rawVal);
      return {
        key: norm2.isValid && norm2.canonical ? norm2.canonical : rawVal.replace(/\D/g, ""),
        type: "cpf"
      };
    }
    if (upperType === "PHONE") {
      const norm2 = validateAndNormalizePixPhone(rawVal);
      const phoneVal = norm2.isValid && norm2.canonical ? norm2.canonical : rawVal.startsWith("+") ? rawVal : `+55${rawVal.replace(/\D/g, "")}`;
      return {
        key: phoneVal,
        type: "phone"
      };
    }
    if (upperType === "EMAIL") {
      const norm2 = validateAndNormalizePixEmail(rawVal);
      return {
        key: norm2.isValid && norm2.canonical ? norm2.canonical : rawVal.toLowerCase(),
        type: "email"
      };
    }
    const norm = validateAndNormalizePixRandom(rawVal);
    return {
      key: norm.isValid && norm.canonical ? norm.canonical : rawVal,
      type: "evp"
    };
  }
  /**
   * Executa a transferência Pix para a chave do motorista via API de Payouts do Mercado Pago
   */
  async executePixPayout(params) {
    const token = this.getAccessToken();
    if (!token) {
      return {
        success: false,
        message: "MERCADO_PAGO_ACCESS_TOKEN n\xE3o configurado no servidor."
      };
    }
    const { routeId, amount, driverName, pixKey, pixKeyType, description } = params;
    if (!amount || amount <= 0) {
      return {
        success: false,
        message: "Valor inv\xE1lido para repasse."
      };
    }
    if (!pixKey) {
      return {
        success: false,
        message: "Motorista n\xE3o possui chave Pix cadastrada."
      };
    }
    const receiver = this.formatReceiverPix(pixKeyType, pixKey);
    const idempotencyKey = `payout_route_${routeId}_${Date.now()}`;
    const desc7 = description || `Repasse frete Rota #${routeId} - Motorista ${driverName}`;
    const payload = {
      payment_method_id: "pix",
      transactions: [
        {
          amount: Math.round(amount * 100) / 100,
          external_reference: `ROUTE_${routeId}`,
          description: desc7.slice(0, 50),
          receiver: {
            pix_key: receiver.key,
            pix_key_type: receiver.type
          }
        }
      ]
    };
    console.log(`[MercadoPago] Iniciando repasse Pix para Rota #${routeId}: R$ ${amount} -> ${receiver.type}:${receiver.key}`);
    try {
      const res = await fetch("https://api.mercadopago.com/v1/payouts", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-Idempotency-Key": idempotencyKey
        },
        body: JSON.stringify(payload)
      });
      const responseData = await res.json().catch(() => null);
      if (!res.ok) {
        console.error(`[MercadoPago Payouts Error ${res.status}]`, responseData);
        if (res.status === 401) {
          return {
            success: false,
            message: "Token de Acesso do Mercado Pago n\xE3o autorizado ou inv\xE1lido (401).",
            raw: responseData
          };
        }
        if (res.status === 403) {
          return {
            success: false,
            message: "A sua conta Mercado Pago ainda n\xE3o tem a funcionalidade de Transfer\xEAncias/Payouts ativada pelo setor comercial do Mercado Pago (403 Forbidden). Caso deseje, voc\xEA pode fazer o Pix diretamente pelo seu banco e registrar o comprovante aqui.",
            raw: responseData
          };
        }
        const msg = responseData?.message || responseData?.error || `Erro HTTP ${res.status} ao processar no Mercado Pago`;
        return {
          success: false,
          message: msg,
          raw: responseData
        };
      }
      const payoutId = responseData?.id || responseData?.transactions?.[0]?.id || `MP_${Date.now()}`;
      const status = responseData?.status || responseData?.transactions?.[0]?.status || "PROCESSED";
      return {
        success: true,
        payoutId: String(payoutId),
        status,
        message: `Transfer\xEAncia Pix enviada via Mercado Pago com sucesso (ID: ${payoutId}, Status: ${status}).`,
        raw: responseData
      };
    } catch (err) {
      console.error(`[MercadoPago Connection Error]`, err);
      return {
        success: false,
        message: `Falha de conex\xE3o com os servidores do Mercado Pago: ${err.message}`
      };
    }
  }
};
var mercadoPagoService = new MercadoPagoService();

// src/server/geocodingService.ts
var UBERLANDIA_LANDMARKS = [
  // Avenidas Principais
  { name: "Avenida Afonso Pena", street: "Avenida Afonso Pena", neighborhood: "Centro", coords: { lat: -18.9186, lng: -48.2772 } },
  { name: "Avenida Rondon Pacheco", street: "Avenida Governador Rondon Pacheco", neighborhood: "Tibery", coords: { lat: -18.9189, lng: -48.2612 } },
  { name: "Avenida Jo\xE3o Naves de \xC1vila", street: "Avenida Jo\xE3o Naves de \xC1vila", neighborhood: "Santa M\xF4nica", coords: { lat: -18.9245, lng: -48.2578 } },
  { name: "Avenida Get\xFAlio Vargas", street: "Avenida Get\xFAlio Vargas", neighborhood: "Daniel Fonseca", coords: { lat: -18.9221, lng: -48.2885 } },
  { name: "Avenida Floriano Peixoto", street: "Avenida Floriano Peixoto", neighborhood: "Brasil", coords: { lat: -18.9056, lng: -48.2778 } },
  { name: "Avenida Anselmo Alves dos Santos", street: "Avenida Anselmo Alves dos Santos", neighborhood: "Santa M\xF4nica", coords: { lat: -18.9123, lng: -48.2456 } },
  { name: "Avenida Segismundo Pereira", street: "Avenida Segismundo Pereira", neighborhood: "Santa M\xF4nica", coords: { lat: -18.9222, lng: -48.2389 } },
  { name: "Avenida Nicomedes Alves dos Santos", street: "Avenida Nicomedes Alves dos Santos", neighborhood: "Morada da Colina", coords: { lat: -18.9502, lng: -48.2778 } },
  { name: "Avenida dos Vinhedos", street: "Avenida dos Vinhedos", neighborhood: "Kara\xEDba (Bairro Vinhedos)", coords: { lat: -18.9542, lng: -48.2828 } },
  { name: "Avenida Belarmino Cotta Pacheco", street: "Avenida Belarmino Cotta Pacheco", neighborhood: "Santa M\xF4nica", coords: { lat: -18.9189, lng: -48.2412 } },
  { name: "Avenida Ces\xE1rio Alvim", street: "Avenida Ces\xE1rio Alvim", neighborhood: "Centro", coords: { lat: -18.9178, lng: -48.2756 } },
  { name: "Avenida Cipriano Del F\xE1vero", street: "Avenida Cipriano Del F\xE1vero", neighborhood: "Centro", coords: { lat: -18.9212, lng: -48.2789 } },
  { name: "Avenida Vasconcelos Costa", street: "Avenida Vasconcelos Costa", neighborhood: "Martins", coords: { lat: -18.9142, lng: -48.2872 } },
  { name: "Avenida Fernando Vilela", street: "Avenida Fernando Vilela", neighborhood: "Martins", coords: { lat: -18.9165, lng: -48.2895 } },
  { name: "Avenida Urumaj\xF3", street: "Avenida Urumaj\xF3", neighborhood: "Saraiva", coords: { lat: -18.9306, lng: -48.2667 } },
  { name: "Avenida Geraldo Motta Batista", street: "Avenida Geraldo Motta Batista", neighborhood: "Daniel Fonseca", coords: { lat: -18.9256, lng: -48.2912 } },
  { name: "Rua Santos Dumont", street: "Rua Santos Dumont", neighborhood: "Centro", coords: { lat: -18.9198, lng: -48.2765 } },
  { name: "Rua Duque de Caxias", street: "Rua Duque de Caxias", neighborhood: "Centro", coords: { lat: -18.9225, lng: -48.2792 } },
  { name: "Rua Tenente Virmondes", street: "Rua Tenente Virmondes", neighborhood: "Centro", coords: { lat: -18.9182, lng: -48.2785 } },
  { name: "Rua Coronel Ant\xF4nio Alves Pereira", street: "Rua Coronel Ant\xF4nio Alves Pereira", neighborhood: "Centro", coords: { lat: -18.9205, lng: -48.2778 } },
  // Shoppings & Centros Comerciais
  { name: "Center Shopping Uberl\xE2ndia", street: "Av. Jo\xE3o Naves de \xC1vila, 1331", neighborhood: "Tibery", coords: { lat: -18.9135, lng: -48.2628 } },
  { name: "Uberl\xE2ndia Shopping", street: "Av. Paulo Gracindo, 15", neighborhood: "G\xE1vea", coords: { lat: -18.9615, lng: -48.2882 } },
  { name: "Pra\xE7a Tubal Vilela", street: "Pra\xE7a Tubal Vilela, S/N", neighborhood: "Centro", coords: { lat: -18.9186, lng: -48.2772 } },
  { name: "Parque do Sabi\xE1", street: "Rua Haia, S/N", neighborhood: "Tibery", coords: { lat: -18.9095, lng: -48.2325 } },
  { name: "Teatro Municipal Oscar Niemeyer", street: "Av. Rondon Pacheco, 7070", neighborhood: "Tibery", coords: { lat: -18.9189, lng: -48.2612 } },
  { name: "Aeroporto de Uberl\xE2ndia (Ten. Cel. Aviador C\xE9sar Bombonato)", street: "Pra\xE7a Jos\xE9 Alves dos Santos, S/N", neighborhood: "Aclima\xE7\xE3o", coords: { lat: -18.8825, lng: -48.2256 } },
  { name: "Hospital de Cl\xEDnicas da UFU (HCU)", street: "Av. Par\xE1, 1720", neighborhood: "Umuarama", coords: { lat: -18.8944, lng: -48.2444 } },
  { name: "Campus Santa M\xF4nica UFU", street: "Av. Jo\xE3o Naves de \xC1vila, 2121", neighborhood: "Santa M\xF4nica", coords: { lat: -18.9189, lng: -48.2589 } },
  { name: "Campus Umuarama UFU", street: "Rua Cear\xE1, S/N", neighborhood: "Umuarama", coords: { lat: -18.8895, lng: -48.2485 } },
  // Condomínios Fechados Notáveis
  { name: "Condom\xEDnio Cyrela Landscape", street: "Av. Nicomedes Alves dos Santos, 5000", neighborhood: "G\xE1vea", coords: { lat: -18.9685, lng: -48.2912 }, isCondo: true },
  { name: "Condom\xEDnio Bosque Kara\xEDba", street: "Rua das Samambaias, 100", neighborhood: "Jardim Kara\xEDba", coords: { lat: -18.9525, lng: -48.2865 }, isCondo: true },
  { name: "Condom\xEDnio Residencial Paradiso", street: "Av. dos Vinhedos, 1200", neighborhood: "Kara\xEDba (Bairro Vinhedos)", coords: { lat: -18.9565, lng: -48.2812 }, isCondo: true },
  { name: "Condom\xEDnio Village Altamira", street: "Rua Guaranis, 450", neighborhood: "Tabajaras", coords: { lat: -18.9285, lng: -48.2845 }, isCondo: true },
  { name: "Condom\xEDnio GSP Life Uberl\xE2ndia", street: "Av. Anselmo Alves dos Santos, 4000", neighborhood: "Novo Mundo", coords: { lat: -18.9167, lng: -48.2222 }, isCondo: true },
  { name: "Condom\xEDnio Granja Marileusa", street: "Av. Floriano Peixoto, 5500", neighborhood: "Granja Marileusa", coords: { lat: -18.8667, lng: -48.2278 }, isCondo: true }
];
var geocodeCache = /* @__PURE__ */ new Map();
var CACHE_TTL_MS = 1e3 * 60 * 60;
function findClosestNeighborhood(coords) {
  const all = getAllMappedNeighborhoods();
  let closest = all[0];
  let minDistance = calculateHaversineDistanceKm(coords.lat, coords.lng, closest.coords.lat, closest.coords.lng);
  for (let i = 1; i < all.length; i++) {
    const d = calculateHaversineDistanceKm(coords.lat, coords.lng, all[i].coords.lat, all[i].coords.lng);
    if (d < minDistance) {
      minDistance = d;
      closest = all[i];
    }
  }
  return closest.name;
}
function matchNeighborhood(rawText, fallbackCoords) {
  if (!rawText || !rawText.trim()) {
    return fallbackCoords ? findClosestNeighborhood(fallbackCoords) : "Centro";
  }
  const clean = rawText.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const all = getAllMappedNeighborhoods();
  for (const n of all) {
    const norm = n.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    if (clean === norm || clean.includes(norm) || norm.includes(clean)) {
      return n.name;
    }
  }
  const rec = findNeighborhoodRecord(rawText);
  if (rec) return rec.name;
  if (fallbackCoords) {
    return findClosestNeighborhood(fallbackCoords);
  }
  return rawText.trim();
}
function extractHouseNumber(query) {
  const match = query.match(/(?:^|\s|,|-|\/|n[º°.]?\s*)(\d{1,5})(?:[a-zA-Z]|\b)/i);
  return match ? match[1] : void 0;
}
function stripStreetPrefix(input) {
  return input.replace(/^(rua|r\.|av\.|avenida|av|alameda|al\.|travessa|trv\.|praça|praca|estrada|rodovia)\s+/i, "").trim();
}
function extractStreetName(input) {
  const normalizedSeparators = input.replace(/\s*-\s*(\d+)/, ", $1");
  const stripped = stripStreetPrefix(normalizedSeparators);
  return stripped.replace(/[-,\s]*\b\d{1,5}\b.*$/, "").replace(/[,-]$/, "").trim();
}
async function queryViaCepStreet(streetName) {
  try {
    const clean = streetName.trim();
    if (clean.length < 3) return [];
    const url = `https://viacep.com.br/ws/MG/Uberlandia/${encodeURIComponent(clean)}/json/`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3e3);
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (resp.ok) {
      const data = await resp.json();
      if (Array.isArray(data)) {
        return data.filter((item) => item.logradouro && item.bairro).map((item) => ({
          street: item.logradouro,
          neighborhood: item.bairro,
          cep: item.cep
        }));
      }
    }
  } catch (err) {
  }
  return [];
}
async function searchAddressSuggestions(query, originCoords) {
  const cleanQuery = query.trim();
  if (cleanQuery.length < 2) return [];
  const cacheKey = cleanQuery.toLowerCase();
  const cached = geocodeCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }
  const results = [];
  const typedNumber = extractHouseNumber(cleanQuery);
  const coreQuery = stripStreetPrefix(cleanQuery);
  const normQuery = cleanQuery.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const normCore = coreQuery.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const localMatches = UBERLANDIA_LANDMARKS.filter((l) => {
    const lNorm = l.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const sNorm = l.street.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const bNorm = l.neighborhood.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return lNorm.includes(normQuery) || sNorm.includes(normQuery) || bNorm.includes(normQuery) || lNorm.includes(normCore) || sNorm.includes(normCore);
  });
  for (const match of localMatches.slice(0, 3)) {
    const finalStreet = typedNumber && !match.street.match(/\d+/) ? `${match.street}, ${typedNumber}` : match.street;
    const dist = originCoords ? Math.round(calculateHaversineDistanceKm(originCoords.lat, originCoords.lng, match.coords.lat, match.coords.lng) * 100) / 100 : void 0;
    results.push({
      id: `local-${match.name}-${typedNumber || "0"}`,
      formattedAddress: finalStreet,
      street: match.street,
      number: typedNumber,
      neighborhood: match.neighborhood,
      city: "Uberl\xE2ndia",
      state: "MG",
      coords: match.coords,
      distanceKm: dist,
      source: "LOCAL_INDEX"
    });
  }
  const queriesToTry = [cleanQuery];
  if (coreQuery !== cleanQuery && coreQuery.length >= 3) {
    queriesToTry.push(coreQuery);
  }
  for (const qToSearch of queriesToTry) {
    if (results.length >= 4) break;
    try {
      const queryParam = qToSearch.toLowerCase().includes("uberlandia") || qToSearch.toLowerCase().includes("uberl\xE2ndia") ? qToSearch : `${qToSearch}, Uberl\xE2ndia, MG, Brasil`;
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(queryParam)}&format=json&addressdetails=1&limit=4&countrycodes=br&viewbox=-48.42,-18.78,-48.15,-19.05`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);
      const resp = await fetch(url, {
        headers: {
          "User-Agent": "KantineDeliveryApp/1.0 (logistica@kantine.com.br)",
          "Accept-Language": "pt-BR,pt;q=0.9"
        },
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (resp.ok) {
        const data = await resp.json();
        for (const item of data) {
          const addr = item.address || {};
          const road = addr.road || addr.pedestrian || addr.street || addr.commercial || item.name || "";
          const houseNumber = addr.house_number || typedNumber || "";
          const rawSuburb = addr.suburb || addr.neighbourhood || addr.quarter || addr.city_district || "";
          const lat = parseFloat(item.lat);
          const lon = parseFloat(item.lon);
          if (!isNaN(lat) && !isNaN(lon) && road) {
            const matchedSuburb = matchNeighborhood(rawSuburb, { lat, lng: lon });
            const finalAddress = houseNumber ? `${road}, ${houseNumber}` : road;
            const dist = originCoords ? Math.round(calculateHaversineDistanceKm(originCoords.lat, originCoords.lng, lat, lon) * 100) / 100 : void 0;
            const isDuplicate = results.some(
              (r) => r.street.toLowerCase() === road.toLowerCase() && r.neighborhood.toLowerCase() === matchedSuburb.toLowerCase()
            );
            if (!isDuplicate) {
              results.push({
                id: `nom-${item.place_id || Math.random()}`,
                formattedAddress: finalAddress,
                street: road,
                number: houseNumber || void 0,
                neighborhood: matchedSuburb,
                city: "Uberl\xE2ndia",
                state: "MG",
                coords: { lat, lng: lon },
                distanceKm: dist,
                source: "NOMINATIM"
              });
            }
          }
        }
      }
    } catch (err) {
      console.warn("[Geocoding] Nominatim query error:", err?.message || err);
    }
  }
  if (results.length === 0) {
    const streetOnly = extractStreetName(cleanQuery);
    if (streetOnly.length >= 3) {
      const viacepResults = await queryViaCepStreet(streetOnly);
      for (const item of viacepResults) {
        const matchedSuburb = matchNeighborhood(item.neighborhood);
        const allNeighborhoods = getAllMappedNeighborhoods();
        const foundN = allNeighborhoods.find(
          (n) => n.name.toLowerCase() === matchedSuburb.toLowerCase()
        ) || allNeighborhoods[0];
        const finalAddress = typedNumber ? `${item.street}, ${typedNumber}` : item.street;
        const dist = originCoords ? Math.round(calculateHaversineDistanceKm(originCoords.lat, originCoords.lng, foundN.coords.lat, foundN.coords.lng) * 100) / 100 : void 0;
        results.push({
          id: `viacep-${item.cep || item.street}`,
          formattedAddress: finalAddress,
          street: item.street,
          number: typedNumber,
          neighborhood: matchedSuburb,
          city: "Uberl\xE2ndia",
          state: "MG",
          coords: foundN.coords,
          distanceKm: dist,
          source: "VIACEP_LOCAL"
        });
      }
    }
  }
  if (results.length === 0) {
    const allNeighborhoods = getAllMappedNeighborhoods();
    const matchedNeighborhoods = allNeighborhoods.filter(
      (n) => n.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(normCore)
    );
    for (const n of matchedNeighborhoods.slice(0, 3)) {
      const dist = originCoords ? Math.round(calculateHaversineDistanceKm(originCoords.lat, originCoords.lng, n.coords.lat, n.coords.lng) * 100) / 100 : void 0;
      results.push({
        id: `bairro-${n.name}`,
        formattedAddress: `Bairro ${n.name}`,
        street: `Bairro ${n.name}`,
        neighborhood: n.name,
        city: "Uberl\xE2ndia",
        state: "MG",
        coords: n.coords,
        distanceKm: dist,
        source: "LOCAL_INDEX"
      });
    }
  }
  results.sort((a, b) => {
    if (a.number && !b.number) return -1;
    if (!a.number && b.number) return 1;
    return (a.distanceKm || 999) - (b.distanceKm || 999);
  });
  const finalResults = results.slice(0, 6);
  geocodeCache.set(cacheKey, { timestamp: Date.now(), data: finalResults });
  return finalResults;
}

// server.ts
dotenv.config();
var __filename = fileURLToPath(import.meta.url);
var __dirname = path3.dirname(__filename);
var app = express();
var args = process.argv.slice(2);
var portFlagIndex = args.indexOf("--port");
var cliPort = portFlagIndex !== -1 && args[portFlagIndex + 1] ? Number(args[portFlagIndex + 1]) : null;
var PORT = cliPort || (process.env.PORT ? Number(process.env.PORT) : 3e3);
process.on("uncaughtException", (err) => {
  const isPgSocketDrop = err?.message?.includes("Connection terminated unexpectedly") || err?.message?.includes("Connection terminated") || err?.code === "ECONNRESET" || err?.code === "EPIPE";
  if (isPgSocketDrop) {
    console.warn("[Server] Caught transient socket termination error (recovering):", err.message);
    return;
  }
  console.error("[Server] Uncaught Exception:", err);
});
process.on("unhandledRejection", (reason) => {
  console.warn("[Server] Unhandled Promise Rejection (handled):", reason?.message || reason);
});
app.use(express.json());
app.get("/api/geocode/autocomplete", async (req, res) => {
  try {
    const q = req.query.q || "";
    const originLat = req.query.originLat ? parseFloat(req.query.originLat) : void 0;
    const originLng = req.query.originLng ? parseFloat(req.query.originLng) : void 0;
    const originCoords = originLat && originLng ? { lat: originLat, lng: originLng } : void 0;
    const suggestions = await searchAddressSuggestions(q, originCoords);
    res.json({ suggestions });
  } catch (err) {
    console.error("[API /api/geocode/autocomplete error]:", err?.message || err);
    res.status(500).json({ error: "Falha no reconhecimento de endere\xE7o", suggestions: [] });
  }
});
telegramBot.setDriverService(driverService);
telegramBot.setDeliveryService(deliveryService);
telegramBot.setRouteService(routeService);
telegramBot.setReferralService(referralService);
app.use((_req, res, next) => {
  res.removeHeader("X-Powered-By");
  next();
});
app.get("/api/admin/drivers", requireAdminAuth, async (req, res) => {
  try {
    const status = req.query.status;
    if (status && !["PENDING", "ACTIVE", "BLOCKED", "EXCLUDED"].includes(status)) {
      return res.status(400).json({ error: "INVALID_STATUS_FILTER" });
    }
    const driversList = await driverService.getDrivers(status);
    res.json(driversList);
  } catch (err) {
    console.error("[API GET /api/admin/drivers failed]", err.message);
    res.status(500).json({ error: "Failed to retrieve drivers" });
  }
});
app.get("/api/admin/drivers/:id", requireAdminAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "INVALID_DRIVER_ID" });
    const driver = await driverService.getDriverById(id);
    if (!driver) return res.status(404).json({ error: "DRIVER_NOT_FOUND" });
    const events = await driverService.getDriverEvents(id);
    const eligible = canReceiveDeliveryOffers(driver);
    res.json({
      driver,
      events,
      canReceiveDeliveryOffers: eligible
    });
  } catch (err) {
    console.error(`[API GET /api/admin/drivers/${req.params.id} failed]`, err.message);
    res.status(500).json({ error: "Failed to fetch driver details" });
  }
});
app.post("/api/admin/drivers/:id/approve", requireAdminAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "INVALID_DRIVER_ID" });
    const driver = await driverService.approveDriver(id);
    res.json({
      success: true,
      driver,
      canReceiveDeliveryOffers: canReceiveDeliveryOffers(driver)
    });
  } catch (err) {
    console.error(`[API POST /api/admin/drivers/${req.params.id}/approve failed]`, err.message);
    if (err.message === "DRIVER_NOT_FOUND") return res.status(404).json({ error: err.message });
    if (err.message.startsWith("CANNOT_APPROVE_FROM_STATUS")) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: "Failed to approve driver" });
  }
});
app.post("/api/admin/drivers/:id/block", requireAdminAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "INVALID_DRIVER_ID" });
    const driver = await driverService.blockDriver(id);
    res.json({
      success: true,
      driver,
      canReceiveDeliveryOffers: canReceiveDeliveryOffers(driver)
    });
  } catch (err) {
    console.error(`[API POST /api/admin/drivers/${req.params.id}/block failed]`, err.message);
    if (err.message === "DRIVER_NOT_FOUND") return res.status(404).json({ error: err.message });
    res.status(500).json({ error: "Failed to block driver" });
  }
});
app.post("/api/admin/drivers/:id/reactivate", requireAdminAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "INVALID_DRIVER_ID" });
    const driver = await driverService.reactivateDriver(id);
    res.json({
      success: true,
      driver,
      canReceiveDeliveryOffers: canReceiveDeliveryOffers(driver)
    });
  } catch (err) {
    console.error(`[API POST /api/admin/drivers/${req.params.id}/reactivate failed]`, err.message);
    if (err.message === "DRIVER_NOT_FOUND") return res.status(404).json({ error: err.message });
    if (err.message.startsWith("CANNOT_REACTIVATE_FROM_STATUS")) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: "Failed to reactivate driver" });
  }
});
app.post("/api/admin/drivers/:id/reject-reactivation", requireAdminAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "INVALID_DRIVER_ID" });
    const { reason } = req.body;
    const actor = req.user?.email || "ADMIN";
    const driver = await driverService.rejectReactivation(id, reason || "", actor);
    res.json({ success: true, driver });
  } catch (err) {
    console.error(`[API POST /api/admin/drivers/${req.params.id}/reject-reactivation failed]`, err.message);
    if (err.message === "DRIVER_NOT_FOUND") return res.status(404).json({ error: err.message });
    res.status(500).json({ error: err.message || "Failed to reject reactivation" });
  }
});
app.post("/api/admin/drivers/:id/exclude", requireAdminAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "INVALID_DRIVER_ID" });
    const { reason } = req.body;
    if (!reason || typeof reason !== "string" || reason.trim().length < 3) {
      return res.status(400).json({ error: "Motivo da exclus\xE3o \xE9 obrigat\xF3rio (m\xEDnimo 3 caracteres)." });
    }
    const actor = req.user?.email || "ADMIN";
    const driver = await driverService.excludeDriver(id, reason.trim(), actor);
    res.json({ success: true, driver });
  } catch (err) {
    console.error(`[API POST /api/admin/drivers/${req.params.id}/exclude failed]`, err.message);
    if (err.message === "DRIVER_NOT_FOUND") return res.status(404).json({ error: err.message });
    res.status(500).json({ error: err.message || "Failed to exclude driver" });
  }
});
app.post("/api/admin/drivers/:id/reinclusion/approve", requireAdminAuth, async (req, res) => {
  return res.status(400).json({
    error: "EXCLUDED_DRIVER_REQUIRES_NEW_INVITE",
    message: "Motoristas exclu\xEDdos t\xEAm o processo zerado e s\xF3 podem ser reinseridos atrav\xE9s de novo convite e aprova\xE7\xE3o (pois podem ter mudado de ve\xEDculo, telefone ou chave PIX)."
  });
});
app.post("/api/admin/drivers/:id/reinclusion/reject", requireAdminAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "INVALID_DRIVER_ID" });
    const { reason } = req.body;
    const actor = req.user?.email || "ADMIN";
    const driver = await driverService.rejectReinclusion(id, reason || "", actor);
    res.json({ success: true, driver });
  } catch (err) {
    console.error(`[API POST /api/admin/drivers/${req.params.id}/reinclusion/reject failed]`, err.message);
    if (err.message === "DRIVER_NOT_FOUND") return res.status(404).json({ error: err.message });
    res.status(500).json({ error: err.message || "Failed to reject reinclusion" });
  }
});
app.post("/api/admin/drivers/:id/reinvite", requireAdminAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "INVALID_DRIVER_ID" });
    const driver = await driverService.getDriverById(id);
    if (!driver) return res.status(404).json({ error: "DRIVER_NOT_FOUND" });
    const actorId = req.user?.email || req.user?.uid || "ADMIN";
    const invitation = await driverService.createDriverInvitation({
      name: driver.name,
      phone: driver.phone,
      vehicle_type: "CAR",
      created_by: actorId
    });
    const status = telegramBot.getStatus();
    const botUsername = status.botUsername || process.env.TELEGRAM_BOT_USERNAME || "KantineEntregasbot";
    const inviteLink = `https://t.me/${botUsername}?start=${invitation.token}`;
    res.json({
      success: true,
      message: "Novo convite gerado com sucesso. O motorista reiniciar\xE1 o cadastro do zero.",
      invitation,
      inviteLink,
      botUsername: status.botUsername || "KantineEntregasbot"
    });
  } catch (err) {
    console.error(`[API POST /api/admin/drivers/${req.params.id}/reinvite failed]`, err.message);
    res.status(500).json({ error: err.message || "Failed to generate reinvite" });
  }
});
app.get("/api/admin/drivers/:id/eligibility", requireAdminAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "INVALID_DRIVER_ID" });
    const driver = await driverService.getDriverById(id);
    if (!driver) return res.status(404).json({ error: "DRIVER_NOT_FOUND" });
    res.json({
      driver_id: driver.id,
      status: driver.status,
      canReceiveDeliveryOffers: canReceiveDeliveryOffers(driver)
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to check eligibility" });
  }
});
app.patch("/api/admin/drivers/:id", requireAdminAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "INVALID_DRIVER_ID" });
    const actorId = req.user?.email || req.user?.uid || "ADMIN";
    const updated = await driverService.updateDriverProfile(id, req.body, {
      actor_type: "ADMIN",
      actor_id: actorId
    });
    res.json({ success: true, driver: updated });
  } catch (err) {
    console.error(`[API PATCH /api/admin/drivers/${req.params.id} failed]`, err.message);
    if (err.message === "DRIVER_NOT_FOUND") {
      return res.status(404).json({ error: err.message });
    }
    res.status(400).json({ error: err.message || "Falha ao atualizar dados do motorista." });
  }
});
app.get("/api/admin/drivers/:id/events", requireAdminAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "INVALID_DRIVER_ID" });
    const events = await driverService.getDriverEvents(id);
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch driver events" });
  }
});
app.get("/api/admin/telegram/status", requireAdminAuth, (_req, res) => {
  const status = telegramBot.getStatus();
  res.json({
    configured: status.configured,
    polling: status.polling,
    botUsername: status.botUsername,
    activeSessions: status.activeSessions
  });
});
app.get("/api/admin/driver-invitations", requireAdminAuth, async (_req, res) => {
  try {
    const invites = await driverService.getDriverInvitations();
    const status = telegramBot.getStatus();
    const botUsername = status.botUsername || process.env.TELEGRAM_BOT_USERNAME || "KantineEntregasbot";
    res.json({
      invitations: invites,
      botUsername: status.botUsername || "KantineEntregasbot",
      defaultInviteLink: `https://t.me/${botUsername}?start=cadastro`
    });
  } catch (err) {
    console.error("[API GET /api/admin/driver-invitations failed]", err.message);
    res.status(500).json({ error: "Failed to retrieve driver invitations" });
  }
});
app.post("/api/admin/driver-invitations", requireAdminAuth, async (req, res) => {
  try {
    const { name, phone, vehicle_type } = req.body;
    const actorId = req.user?.email || req.user?.uid || "ADMIN";
    const invitation = await driverService.createDriverInvitation({
      name,
      phone,
      vehicle_type,
      created_by: actorId
    });
    const status = telegramBot.getStatus();
    const botUsername = status.botUsername || process.env.TELEGRAM_BOT_USERNAME || "KantineEntregasbot";
    const inviteLink = `https://t.me/${botUsername}?start=${invitation.token}`;
    res.json({
      success: true,
      invitation,
      inviteLink,
      botUsername: status.botUsername || "KantineEntregasbot"
    });
  } catch (err) {
    console.error("[API POST /api/admin/driver-invitations failed]", err.message);
    res.status(500).json({ error: "Failed to create driver invitation" });
  }
});
app.post("/api/admin/driver-invitations/:id/cancel", requireAdminAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "INVALID_INVITATION_ID" });
    const success = await driverService.cancelDriverInvitation(id);
    res.json({ success });
  } catch (err) {
    res.status(500).json({ error: "Failed to cancel driver invitation" });
  }
});
app.post("/api/admin/driver-invitations/:id/convert", requireAdminAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "INVALID_INVITATION_ID" });
    const driver = await driverService.convertInvitationToDriver(id);
    res.json({ success: true, driver });
  } catch (err) {
    console.error(`[API POST /api/admin/driver-invitations/${req.params.id}/convert failed]`, err.message);
    res.status(500).json({ error: err.message || "Failed to convert invitation to driver" });
  }
});
app.post("/api/admin/system/reset-drivers-history", requireAdminAuth, async (_req, res) => {
  try {
    await driverService.resetAllDriversAndHistory();
    await telegramBot.clearAllSessions();
    const status = telegramBot.getStatus();
    res.json({
      success: true,
      message: "Todos os motoristas, convites, rotas e hist\xF3ricos foram limpos com sucesso. O Telegram Kantine Entregas foi zerado para novos cadastros.",
      botUsername: status.botUsername || "KantineEntregasbot"
    });
  } catch (err) {
    console.error("[API POST /api/admin/system/reset-drivers-history failed]", err.message);
    res.status(500).json({ error: err.message || "Falha ao resetar motoristas e hist\xF3rico." });
  }
});
app.get("/api/admin/referrals", requireAdminAuth, async (req, res) => {
  try {
    const status = req.query.status;
    const search = req.query.search;
    const referrals = await referralService.getReferrals({ status, search });
    res.json(referrals);
  } catch (err) {
    console.error("[API GET /api/admin/referrals failed]", err.message);
    res.status(500).json({ error: "Failed to retrieve referrals" });
  }
});
app.post("/api/admin/referrals/:id/approve", requireAdminAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "INVALID_REFERRAL_ID" });
    const adminActor = req.user?.email || req.user?.uid || "ADMIN";
    const result = await referralService.approveReferral(id, adminActor);
    res.json({
      success: true,
      referral: result.referral,
      inviteLink: result.inviteLink
    });
  } catch (err) {
    console.error(`[API POST /api/admin/referrals/${req.params.id}/approve failed]`, err.message);
    res.status(400).json({ error: err.message });
  }
});
app.post("/api/admin/referrals/:id/reject", requireAdminAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "INVALID_REFERRAL_ID" });
    const { reason } = req.body || {};
    const adminActor = req.user?.email || req.user?.uid || "ADMIN";
    const referral = await referralService.rejectReferral(id, adminActor, reason);
    res.json({
      success: true,
      referral
    });
  } catch (err) {
    console.error(`[API POST /api/admin/referrals/${req.params.id}/reject failed]`, err.message);
    res.status(400).json({ error: err.message });
  }
});
app.get("/api/admin/referrals/:id/events", requireAdminAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "INVALID_REFERRAL_ID" });
    const events = await referralService.getReferralEvents(id);
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch referral events" });
  }
});
app.post("/api/admin/telegram/configure", requireAdminAuth, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token || typeof token !== "string" || !token.includes(":")) {
      return res.status(400).json({ error: "INVALID_TOKEN_FORMAT" });
    }
    telegramBot.stop();
    telegramBot.updateTokenFromEnv(token);
    await telegramBot.start();
    const status = telegramBot.getStatus();
    res.json({
      success: true,
      configured: status.configured,
      polling: status.polling,
      botUsername: status.botUsername
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to configure Telegram bot" });
  }
});
app.post("/api/admin/telegram/simulate-update", requireAdminAuth, async (req, res) => {
  try {
    const { update } = req.body;
    if (!update) return res.status(400).json({ error: "MISSING_UPDATE" });
    await telegramBot.handleUpdate(update);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get("/api/admin/telegram/recent-messages", requireAdminAuth, (_req, res) => {
  res.json(telegramBot.getRecentDispatches());
});
app.post("/api/admin/telegram/clear-recent-messages", requireAdminAuth, (_req, res) => {
  telegramBot.clearRecentDispatches();
  res.json({ success: true });
});
app.get("/api/admin/deliveries", requireAdminAuth, async (req, res) => {
  try {
    const status = req.query.status;
    if (status && !["DRAFT", "OFFERED", "ACCEPTED", "CANCELLED"].includes(status)) {
      return res.status(400).json({ error: "INVALID_STATUS_FILTER" });
    }
    const deliveriesList = await deliveryService.getDeliveries(status);
    res.json(deliveriesList);
  } catch (err) {
    console.error("[API GET /api/admin/deliveries failed]", err.message);
    res.status(500).json({ error: "Failed to retrieve deliveries" });
  }
});
app.post("/api/admin/deliveries", requireAdminAuth, async (req, res) => {
  try {
    const {
      pickup_location,
      destination_address,
      destination_neighborhood,
      cargo_description,
      delivery_fee,
      delivery_mode,
      observations
    } = req.body;
    const delivery = await deliveryService.createDraft(
      {
        pickup_location,
        destination_address,
        destination_neighborhood,
        cargo_description,
        delivery_fee,
        delivery_mode,
        observations
      },
      req.user?.email || "ADMIN"
    );
    res.status(201).json({ success: true, delivery });
  } catch (err) {
    console.error("[API POST /api/admin/deliveries failed]", err.message);
    if (err.message === "MISSING_REQUIRED_FIELDS") {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: "Failed to create delivery draft" });
  }
});
app.get("/api/admin/deliveries/:id", requireAdminAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "INVALID_DELIVERY_ID" });
    const details = await deliveryService.getDeliveryDetails(id);
    res.json(details);
  } catch (err) {
    console.error(`[API GET /api/admin/deliveries/${req.params.id} failed]`, err.message);
    if (err.message === "DELIVERY_NOT_FOUND") return res.status(404).json({ error: err.message });
    res.status(500).json({ error: "Failed to fetch delivery details" });
  }
});
app.post("/api/admin/deliveries/:id/publish", requireAdminAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "INVALID_DELIVERY_ID" });
    const result = await deliveryService.publishDelivery(id, req.user?.email || "ADMIN");
    res.json({ success: true, ...result });
  } catch (err) {
    console.error(`[API POST /api/admin/deliveries/${req.params.id}/publish failed]`, err.message);
    if (err.message === "DELIVERY_NOT_FOUND") return res.status(404).json({ error: err.message });
    if (err.message === "NO_ACTIVE_DRIVERS_AVAILABLE") {
      return res.status(400).json({
        error: "NO_ACTIVE_DRIVERS_AVAILABLE",
        code: "NO_ELIGIBLE_DRIVERS",
        message: "Nenhum motorista ativo dispon\xEDvel para receber esta entrega. A entrega permanece como rascunho."
      });
    }
    if (err.message === "DELIVERY_ALREADY_OFFERED" || err.message === "CANNOT_PUBLISH_CANCELLED_DELIVERY") {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: "Failed to publish delivery" });
  }
});
app.post("/api/admin/deliveries/:id/cancel", requireAdminAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "INVALID_DELIVERY_ID" });
    const delivery = await deliveryService.cancelDelivery(id, req.user?.email || "ADMIN");
    res.json({ success: true, delivery });
  } catch (err) {
    console.error(`[API POST /api/admin/deliveries/${req.params.id}/cancel failed]`, err.message);
    if (err.message === "DELIVERY_NOT_FOUND") return res.status(404).json({ error: err.message });
    if (err.message === "DELIVERY_ALREADY_CANCELLED") return res.status(400).json({ error: err.message });
    if (err.message === "CANNOT_CANCEL_ACCEPTED_DELIVERY") {
      return res.status(400).json({
        error: "CANNOT_CANCEL_ACCEPTED_DELIVERY",
        message: "Entregas j\xE1 aceitas n\xE3o podem ser canceladas neste marco."
      });
    }
    res.status(500).json({ error: "Failed to cancel delivery" });
  }
});
app.post("/api/admin/deliveries/:id/accept", requireAdminAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "INVALID_DELIVERY_ID" });
    const { driver_id, telegram_user_id } = req.body;
    if (!driver_id && !telegram_user_id) {
      return res.status(400).json({ error: "MISSING_DRIVER_IDENTIFIER" });
    }
    const result = await deliveryService.acceptDelivery(id, {
      driverId: driver_id ? parseInt(driver_id, 10) : void 0,
      telegramUserId: telegram_user_id ? String(telegram_user_id) : void 0
    });
    if (result.status === "WON" || result.status === "ALREADY_WON") {
      return res.status(200).json({ success: true, ...result });
    } else if (result.status === "LOST") {
      return res.status(409).json({ success: false, ...result });
    } else {
      return res.status(400).json({ success: false, ...result });
    }
  } catch (err) {
    console.error(`[API POST /api/admin/deliveries/${req.params.id}/accept failed]`, err.message);
    res.status(500).json({ error: "Failed to process delivery acceptance" });
  }
});
app.get("/api/admin/pickup-locations", requireAdminAuth, async (_req, res) => {
  try {
    const locations = await routeService.getPickupLocations();
    res.json(locations);
  } catch (err) {
    console.error("[API GET /api/admin/pickup-locations failed]", err.message);
    res.status(500).json({ error: "Failed to retrieve pickup locations" });
  }
});
app.post("/api/admin/pickup-locations", requireAdminAuth, async (req, res) => {
  try {
    const { name, address, neighborhood, active } = req.body;
    const location = await routeService.createPickupLocation({ name, address, neighborhood, active });
    res.status(201).json({ success: true, location });
  } catch (err) {
    console.error("[API POST /api/admin/pickup-locations failed]", err.message);
    if (err.message === "MISSING_PICKUP_LOCATION_FIELDS") {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: "Failed to create pickup location" });
  }
});
app.patch("/api/admin/pickup-locations/:id", requireAdminAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "INVALID_LOCATION_ID" });
    const updated = await routeService.updatePickupLocation(id, req.body);
    res.json({ success: true, location: updated });
  } catch (err) {
    console.error(`[API PATCH /api/admin/pickup-locations/${req.params.id} failed]`, err.message);
    if (err.message === "PICKUP_LOCATION_NOT_FOUND") {
      return res.status(404).json({ error: err.message });
    }
    res.status(500).json({ error: "Failed to update pickup location" });
  }
});
app.get("/api/admin/routes", requireAdminAuth, async (req, res) => {
  try {
    const status = req.query.status;
    if (status && ![
      "DRAFT",
      "OFFERED",
      "ACCEPTED",
      "ARRIVED_PICKUP",
      "PICKED_UP",
      "IN_TRANSIT",
      "COMPLETED",
      "CANCELLED"
    ].includes(status)) {
      return res.status(400).json({ error: "INVALID_STATUS_FILTER" });
    }
    const routesList = await routeService.getRoutes(status);
    res.json(await scheduleService.decorate(routesList));
  } catch (err) {
    console.error("[API GET /api/admin/routes failed]", err.message);
    res.status(500).json({ error: "Failed to retrieve routes" });
  }
});
app.post("/api/admin/routes", requireAdminAuth, async (req, res) => {
  try {
    const route = await routeService.createDraft(req.body, req.user?.email || "ADMIN");
    res.status(201).json({ success: true, route });
  } catch (err) {
    console.error("[API POST /api/admin/routes failed]", err.message);
    res.status(400).json({ error: err.message || "Failed to create route draft" });
  }
});
app.get("/api/admin/routes/:id", requireAdminAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "INVALID_ROUTE_ID" });
    const details = await routeService.getRouteDetails(id);
    if (details?.route) details.route = (await scheduleService.decorate([details.route]))[0];
    res.json(details);
  } catch (err) {
    console.error(`[API GET /api/admin/routes/${req.params.id} failed]`, err.message);
    if (err.message === "ROUTE_NOT_FOUND") return res.status(404).json({ error: err.message });
    res.status(500).json({ error: "Failed to fetch route details" });
  }
});
app.patch("/api/admin/routes/:id/vehicle-types", requireAdminAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "INVALID_ROUTE_ID" });
    const { accepted_vehicle_types } = req.body;
    if (!Array.isArray(accepted_vehicle_types) || accepted_vehicle_types.length === 0) {
      return res.status(400).json({ error: "AT_LEAST_ONE_VEHICLE_TYPE_REQUIRED" });
    }
    const updated = await routeService.updateRouteVehicleTypes(
      id,
      accepted_vehicle_types,
      req.user?.email || "ADMIN"
    );
    res.json({ success: true, route: updated });
  } catch (err) {
    console.error(`[API PATCH /api/admin/routes/${req.params.id}/vehicle-types failed]`, err.message);
    if (err.message === "ROUTE_NOT_FOUND") return res.status(404).json({ error: err.message });
    res.status(500).json({ error: err.message || "Failed to update vehicle types" });
  }
});
app.post("/api/admin/routes/:id/publish", requireAdminAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "INVALID_ROUTE_ID" });
    const result = await routeService.publishRoute(id, req.user?.email || "ADMIN", req.body);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error(`[API POST /api/admin/routes/${req.params.id}/publish failed]`, err.message);
    if (err.message === "ROUTE_NOT_FOUND") return res.status(404).json({ error: err.message });
    if (err.message.startsWith("NEIGHBORHOOD_REQUIRED_FOR_PUBLICATION")) {
      return res.status(400).json({
        error: err.message,
        code: "NEIGHBORHOOD_REQUIRED_FOR_PUBLICATION",
        message: err.message.replace(/^NEIGHBORHOOD_REQUIRED_FOR_PUBLICATION:\s*/, "")
      });
    }
    if (err.message === "NO_ACTIVE_DRIVERS_AVAILABLE") {
      return res.status(400).json({
        error: "NO_ACTIVE_DRIVERS_AVAILABLE",
        code: "NO_ELIGIBLE_DRIVERS",
        message: "Nenhum motorista ativo com ve\xEDculo compat\xEDvel dispon\xEDvel para esta rota. A rota permanece como rascunho."
      });
    }
    if (err.message === "ROUTE_ALREADY_OFFERED" || err.message === "CANNOT_PUBLISH_CANCELLED_ROUTE") {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: err.message || "Failed to publish route" });
  }
});
app.post("/api/admin/routes/:id/cancel", requireAdminAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "INVALID_ROUTE_ID" });
    const { reason, compensation_amount, resolution_type, resolution_note } = req.body || {};
    const route = await routeService.cancelRoute(id, req.user?.email || "ADMIN", reason, {
      compensation_amount: compensation_amount !== void 0 && compensation_amount !== "" && compensation_amount !== null ? parseFloat(String(compensation_amount).replace(",", ".")) : void 0,
      resolution_type,
      resolution_note
    });
    res.json({
      success: true,
      route,
      message: `Rota #${id} cancelada com sucesso e encaminhada para o setor de Pend\xEAncias Operacionais.`
    });
  } catch (err) {
    console.error(`[API POST /api/admin/routes/${req.params.id}/cancel failed]`, err.message);
    if (err.message === "ROUTE_NOT_FOUND") return res.status(404).json({ error: err.message });
    if (err.message === "ROUTE_ALREADY_CANCELLED") return res.status(400).json({ error: err.message });
    res.status(500).json({ error: err.message || "Failed to cancel route" });
  }
});
app.post("/api/admin/routes/:id/scheduled-for", requireAdminAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "INVALID_ROUTE_ID" });
    const raw = req.body?.scheduled_for;
    const when = raw ? new Date(raw) : null;
    if (when && isNaN(when.getTime())) return res.status(400).json({ error: "INVALID_DATE", message: "Data/hora inv\xE1lida." });
    const route = await routeService.getRouteById(id);
    if (!route) return res.status(404).json({ error: "ROUTE_NOT_FOUND" });
    if (route.status !== "DRAFT") return res.status(409).json({ error: "ROUTE_NOT_DRAFT", message: "S\xF3 d\xE1 para mudar o hor\xE1rio de rotas em rascunho." });
    res.json({ success: true, schedule: await scheduleService.setScheduledFor(id, when) });
  } catch (err) {
    console.error(`[API POST /api/admin/routes/${req.params.id}/scheduled-for]`, err.message);
    res.status(500).json({ error: err.message });
  }
});
app.post("/api/admin/routes/:id/schedule", requireAdminAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "INVALID_ROUTE_ID" });
    if (req.body?.scheduled_for) {
      const when = new Date(req.body.scheduled_for);
      if (isNaN(when.getTime())) return res.status(400).json({ error: "INVALID_DATE", message: "Data/hora inv\xE1lida." });
      await scheduleService.setScheduledFor(id, when);
    }
    const r = await scheduleService.schedulePublish(id, req.user?.email || "ADMIN");
    res.json({ success: true, ...r, leadMinutes: OFFER_LEAD_MINUTES() });
  } catch (err) {
    const msg = String(err?.message || "");
    const known = {
      ROUTE_NOT_FOUND: [404, "Rota n\xE3o encontrada."],
      ROUTE_NOT_DRAFT: [409, "S\xF3 rotas em rascunho podem ter a oferta agendada."],
      SCHEDULED_FOR_REQUIRED: [400, "Informe a data e hora da entrega."],
      SCHEDULED_FOR_IN_PAST: [400, "A data/hora da entrega j\xE1 passou."],
      NO_ACTIVE_DRIVERS_AVAILABLE: [400, "Hor\xE1rio da oferta j\xE1 chegou, mas nenhum motorista ativo com ve\xEDculo compat\xEDvel est\xE1 dispon\xEDvel. A rota segue como rascunho."]
    };
    if (known[msg]) return res.status(known[msg][0]).json({ error: msg, message: known[msg][1] });
    console.error(`[API POST /api/admin/routes/${req.params.id}/schedule]`, msg);
    res.status(500).json({ error: msg || "Falha ao agendar a oferta." });
  }
});
app.post("/api/admin/routes/:id/unschedule", requireAdminAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "INVALID_ROUTE_ID" });
    res.json({ success: true, schedule: await scheduleService.unschedulePublish(id, req.user?.email || "ADMIN") });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post("/api/webhooks/scheduler/tick", async (req, res) => {
  try {
    const config = await takeatService.getConfig("MATRIZ");
    const expected = String(config.webhook_secret || process.env.TAKEAT_WEBHOOK_SECRET || "").trim();
    const token = String(req.headers["x-webhook-token"] || req.headers["authorization"] || "").replace(/^Bearer\s+/i, "").trim();
    const a = Buffer.from(token);
    const b = Buffer.from(expected);
    if (!expected || a.length !== b.length || !crypto2.timingSafeEqual(a, b)) return res.status(401).json({ error: "INVALID_WEBHOOK_TOKEN" });
    res.json({ success: true, ...await scheduleService.tick() });
  } catch (err) {
    console.error("[agendador tick]", err.message);
    res.status(500).json({ error: err.message });
  }
});
app.delete("/api/admin/routes/:id", requireAdminAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "INVALID_ROUTE_ID" });
    await routeService.deleteRouteWithoutDriver(id);
    res.json({ success: true, message: `Rota #${id} exclu\xEDda.` });
  } catch (err) {
    const msg = String(err?.message || "");
    if (msg === "ROUTE_NOT_FOUND") return res.status(404).json({ error: msg });
    if (msg === "ROUTE_HAS_DRIVER" || msg === "ROUTE_NOT_DELETABLE") {
      return res.status(409).json({ error: msg, message: "S\xF3 rotas em rascunho ou canceladas que nunca tiveram entregador podem ser exclu\xEDdas." });
    }
    console.error(`[API DELETE /api/admin/routes/${req.params.id} error]`, msg);
    res.status(500).json({ error: msg || "Falha ao excluir rota." });
  }
});
app.post("/api/admin/routes/:id/edit-preview", requireAdminAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "INVALID_ROUTE_ID" });
    const route = await routeService.getRouteById(id);
    if (!route) return res.status(404).json({ error: "ROUTE_NOT_FOUND" });
    const analysis = routeEditService.classifyRouteEdit(route, req.body);
    res.json(analysis);
  } catch (err) {
    if (err.message?.startsWith("CANNOT_EDIT_")) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});
app.post("/api/admin/routes/:id/edit", requireAdminAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "INVALID_ROUTE_ID" });
    const actor = req.user?.email || "ADMIN";
    const result = await routeEditService.executeRouteEdit(id, req.body, actor);
    res.json({ success: true, ...result });
  } catch (err) {
    if (err.message === "ROUTE_NOT_FOUND") return res.status(404).json({ error: err.message });
    if (err.message?.startsWith("CONCURRENT_MODIFICATION_CONFLICT")) {
      return res.status(409).json({ error: err.message });
    }
    if (err.message?.startsWith("CANNOT_EDIT_")) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});
app.get("/api/admin/routes/:id/updates", requireAdminAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "INVALID_ROUTE_ID" });
    const updates = await routeEditService.getRouteUpdates(id);
    res.json(updates);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post("/api/admin/routes/:id/discard-rejected-proposal", requireAdminAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "INVALID_ROUTE_ID" });
    await routeEditService.discardRejectedProposal(id, req.user?.email || "ADMIN");
    const refreshed = await routeService.getRouteById(id);
    res.json({ success: true, route: refreshed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post("/api/admin/routes/:id/accept", requireAdminAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "INVALID_ROUTE_ID" });
    const { driver_id, telegram_user_id } = req.body;
    if (!driver_id && !telegram_user_id) {
      return res.status(400).json({ error: "MISSING_DRIVER_IDENTIFIER" });
    }
    const result = await routeService.acceptRoute(id, {
      driverId: driver_id ? parseInt(driver_id, 10) : void 0,
      telegramUserId: telegram_user_id ? String(telegram_user_id) : void 0
    });
    if (result.status === "WON" || result.status === "ALREADY_WON") {
      return res.status(200).json({ success: true, ...result });
    } else if (result.status === "LOST") {
      return res.status(409).json({ success: false, ...result });
    } else {
      return res.status(400).json({ success: false, ...result });
    }
  } catch (err) {
    console.error(`[API POST /api/admin/routes/${req.params.id}/accept failed]`, err.message);
    res.status(500).json({ error: "Failed to process route acceptance" });
  }
});
app.post("/api/admin/routes/:id/arrived-pickup", requireAdminAuth, async (req, res) => {
  try {
    const routeId = parseInt(req.params.id, 10);
    const route = await routeService.getRouteById(routeId);
    if (!route) {
      return res.status(404).json({ error: "Route not found" });
    }
    if (!route.accepted_driver_id) {
      return res.status(400).json({ error: "ROUTE_NOT_ACCEPTED: Rota ainda n\xE3o possui motorista alocado" });
    }
    const driverId = route.accepted_driver_id;
    const updated = await routeService.markArrivedPickup(routeId, { driverId });
    res.json({ success: true, route: updated });
  } catch (err) {
    console.error(`[API POST /api/admin/routes/${req.params.id}/arrived-pickup error]`, err.message);
    res.status(400).json({ error: err.message });
  }
});
app.post("/api/admin/routes/:id/picked-up", requireAdminAuth, async (req, res) => {
  try {
    const routeId = parseInt(req.params.id, 10);
    const route = await routeService.getRouteById(routeId);
    if (!route) {
      return res.status(404).json({ error: "Route not found" });
    }
    if (!route.accepted_driver_id) {
      return res.status(400).json({ error: "ROUTE_NOT_ACCEPTED: Rota ainda n\xE3o possui motorista alocado" });
    }
    const driverId = route.accepted_driver_id;
    const updated = await routeService.markPickedUp(routeId, { driverId });
    res.json({ success: true, route: updated });
  } catch (err) {
    console.error(`[API POST /api/admin/routes/${req.params.id}/picked-up error]`, err.message);
    res.status(400).json({ error: err.message });
  }
});
app.post("/api/admin/routes/:id/start", requireAdminAuth, async (req, res) => {
  try {
    const routeId = parseInt(req.params.id, 10);
    const route = await routeService.getRouteById(routeId);
    if (!route) {
      return res.status(404).json({ error: "Route not found" });
    }
    if (!route.accepted_driver_id) {
      return res.status(400).json({ error: "ROUTE_NOT_ACCEPTED: Rota ainda n\xE3o possui motorista alocado" });
    }
    const driverId = route.accepted_driver_id;
    const result = await routeService.startRoute(routeId, { driverId });
    res.json({ success: true, ...result });
  } catch (err) {
    console.error(`[API POST /api/admin/routes/${req.params.id}/start error]`, err.message);
    res.status(400).json({ error: err.message });
  }
});
app.post("/api/admin/routes/stops/:id/deliver-pin", requireAdminAuth, async (req, res) => {
  try {
    const stopId = parseInt(req.params.id, 10);
    const stop = await routeService.getStopById(stopId);
    if (!stop) {
      return res.status(404).json({ error: "Stop not found" });
    }
    const route = await routeService.getRouteById(stop.route_id);
    if (!route?.accepted_driver_id) {
      return res.status(400).json({ error: "ROUTE_NOT_ACCEPTED: Rota ainda n\xE3o possui motorista alocado" });
    }
    const driverId = route.accepted_driver_id;
    const { pin } = req.body;
    const result = await routeService.deliverStopWithPin(stopId, pin, { driverId });
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (err) {
    console.error(`[API POST /api/admin/routes/stops/${req.params.id}/deliver-pin error]`, err.message);
    res.status(400).json({ error: err.message });
  }
});
app.post("/api/admin/routes/stops/:id/deliver-photo", requireAdminAuth, async (req, res) => {
  try {
    const stopId = parseInt(req.params.id, 10);
    const stop = await routeService.getStopById(stopId);
    if (!stop) {
      return res.status(404).json({ error: "Stop not found" });
    }
    const route = await routeService.getRouteById(stop.route_id);
    if (!route?.accepted_driver_id) {
      return res.status(400).json({ error: "ROUTE_NOT_ACCEPTED: Rota ainda n\xE3o possui motorista alocado" });
    }
    const driverId = route.accepted_driver_id;
    const { proof_reference } = req.body;
    const result = await routeService.deliverStopWithPhoto(stopId, proof_reference, { driverId });
    res.json(result);
  } catch (err) {
    console.error(`[API POST /api/admin/routes/stops/${req.params.id}/deliver-photo error]`, err.message);
    res.status(400).json({ error: err.message });
  }
});
app.post("/api/admin/routes/stops/:id/incident", requireAdminAuth, async (req, res) => {
  try {
    const stopId = parseInt(req.params.id, 10);
    const stop = await routeService.getStopById(stopId);
    if (!stop) {
      return res.status(404).json({ error: "Stop not found" });
    }
    const route = await routeService.getRouteById(stop.route_id);
    if (!route?.accepted_driver_id) {
      return res.status(400).json({ error: "ROUTE_NOT_ACCEPTED: Rota ainda n\xE3o possui motorista alocado" });
    }
    const driverId = route.accepted_driver_id;
    const { incident_type, incident_note } = req.body;
    const result = await routeService.reportStopIncident(stopId, { incident_type, incident_note }, { driverId });
    res.json(result);
  } catch (err) {
    console.error(`[API POST /api/admin/routes/stops/${req.params.id}/incident error]`, err.message);
    res.status(400).json({ error: err.message });
  }
});
app.get("/api/telegram/file-url/:fileId", requireAdminAuth, async (req, res) => {
  try {
    const fileUrl = await telegramBot.getFileUrl(req.params.fileId);
    res.json({ url: fileUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get("/api/admin/drivers/referral-vehicle-audit", requireAdminAuth, async (_req, res) => {
  try {
    const audit = await driverService.getReferralVehicleAudit();
    res.json(audit);
  } catch (err) {
    console.error("[API GET /api/admin/drivers/referral-vehicle-audit error]", err.message);
    res.status(500).json({ error: err.message });
  }
});
app.get("/api/admin/incidents", requireAdminAuth, async (req, res) => {
  try {
    const resolution_status = req.query.resolution_status || "ALL";
    const search = req.query.search;
    const incidents = await routeService.getIncidents({ resolution_status, search });
    res.json(incidents);
  } catch (err) {
    console.error("[API GET /api/admin/incidents error]", err.message);
    res.status(500).json({ error: err.message });
  }
});
app.post("/api/admin/stops/:id/resolve", requireAdminAuth, async (req, res) => {
  try {
    const stopId = parseInt(req.params.id, 10);
    const { resolution_type, resolution_note, compensation_amount, adjust_route_fee } = req.body;
    const actor = req.user?.email || req.user?.uid || "ADMIN";
    if (!resolution_type) {
      return res.status(400).json({ error: "MISSING_RESOLUTION_TYPE" });
    }
    const updatedStop = await routeService.resolveStopIncident(stopId, {
      resolution_type,
      resolution_note,
      resolved_by: actor,
      compensation_amount: compensation_amount !== void 0 && compensation_amount !== "" && compensation_amount !== null ? parseFloat(String(compensation_amount).replace(",", ".")) : void 0,
      adjust_route_fee: adjust_route_fee !== false
    });
    res.json({
      success: true,
      stop: updatedStop,
      message: "Incidente resolvido com sucesso."
    });
  } catch (err) {
    console.error(`[API POST /api/admin/stops/${req.params.id}/resolve error]`, err.message);
    res.status(400).json({ error: err.message });
  }
});
app.post("/api/admin/routes/:id/finalize", requireAdminAuth, async (req, res) => {
  try {
    const routeId = parseInt(req.params.id, 10);
    if (isNaN(routeId)) return res.status(400).json({ error: "INVALID_ROUTE_ID" });
    const actor = req.user?.email || req.user?.uid || "ADMIN";
    const updatedRoute = await routeService.finalizeAndCompleteRoute(routeId, actor);
    if (updatedRoute.accepted_driver_id) {
      const driver = await driverService.getDriverById(updatedRoute.accepted_driver_id).catch(() => null);
      const chatId = driver?.telegram_chat_id || driver?.telegram_user_id;
      if (chatId) {
        await telegramBot.sendFinalRouteSummary(chatId, updatedRoute.id).catch(() => null);
      }
    }
    res.json({ success: true, route: updatedRoute });
  } catch (err) {
    console.error(`[API POST /api/admin/routes/${req.params.id}/finalize error]`, err.message);
    res.status(500).json({ error: err.message });
  }
});
app.get("/api/admin/payments", requireAdminAuth, async (req, res) => {
  try {
    const payment_status = req.query.payment_status || "ALL";
    const driver_id = req.query.driver_id ? parseInt(req.query.driver_id, 10) : void 0;
    const search = req.query.search;
    const paymentsData = await routeService.getPaymentsData({
      payment_status,
      driver_id,
      search
    });
    res.json(paymentsData);
  } catch (err) {
    console.error("[API GET /api/admin/payments error]", err.message);
    res.status(500).json({ error: err.message });
  }
});
app.post("/api/admin/routes/:id/pay", requireAdminAuth, async (req, res) => {
  try {
    const routeId = parseInt(req.params.id, 10);
    const { payment_method, payment_reference, payment_note } = req.body;
    const actor = req.user?.email || req.user?.uid || "ADMIN";
    const updatedRoute = await routeService.registerRoutePayment(routeId, {
      paid_by: actor,
      payment_method,
      payment_reference,
      payment_note
    });
    res.json({
      success: true,
      route: updatedRoute,
      message: "Pagamento da rota registrado com sucesso."
    });
  } catch (err) {
    console.error(`[API POST /api/admin/routes/${req.params.id}/pay error]`, err.message);
  }
});
app.get("/api/admin/payments/mercadopago/status", requireAdminAuth, async (_req, res) => {
  try {
    const info = await mercadoPagoService.getAccountInfo();
    res.json(info);
  } catch (err) {
    res.status(500).json({ configured: false, error: err.message });
  }
});
app.post("/api/admin/routes/:id/pay-mercadopago", requireAdminAuth, async (req, res) => {
  try {
    const routeId = parseInt(req.params.id, 10);
    const actor = req.user?.email || req.user?.uid || "ADMIN";
    const route = await routeService.getRouteById(routeId);
    if (!route) {
      return res.status(404).json({ error: "ROUTE_NOT_FOUND" });
    }
    if (route.status !== "COMPLETED" && route.status !== "CANCELLED") {
      return res.status(400).json({ error: `Apenas rotas conclu\xEDdas ou canceladas podem receber repasse (Status atual: ${route.status}).` });
    }
    if (route.payment_status === "PAID") {
      return res.status(400).json({ error: "Esta rota j\xE1 foi paga anteriormente." });
    }
    if (!route.accepted_driver_id) {
      return res.status(400).json({ error: "Rota n\xE3o possui motorista associado." });
    }
    const driver = await driverService.getDriverById(route.accepted_driver_id);
    if (!driver) {
      return res.status(404).json({ error: "Motorista n\xE3o encontrado no sistema." });
    }
    const pixKey = (driver.pix_key_value || driver.pix_key || "").trim();
    if (!pixKey) {
      return res.status(400).json({ error: "O motorista n\xE3o possui chave Pix cadastrada para repasse." });
    }
    const totalNum = parseFloat(String(route.total_fee || "0").replace(",", ".")) || 0;
    const storeRate = route.management_rate_snapshot != null && !isNaN(parseFloat(String(route.management_rate_snapshot))) ? parseFloat(String(route.management_rate_snapshot)) : 0.1;
    const driverFeeNum = Math.round(totalNum * (1 - storeRate) * 100) / 100;
    const payoutResult = await mercadoPagoService.executePixPayout({
      routeId,
      amount: driverFeeNum,
      driverName: driver.name,
      pixKey,
      pixKeyType: driver.pix_key_type || "RANDOM",
      description: `Repasse Pix Rota #${routeId}`
    });
    if (!payoutResult.success) {
      return res.status(400).json({
        error: payoutResult.message,
        details: payoutResult.raw
      });
    }
    const updatedRoute = await routeService.registerRoutePayment(routeId, {
      paid_by: actor,
      payment_method: "PIX_MERCADO_PAGO",
      payment_reference: payoutResult.payoutId,
      payment_note: `Repasse Pix automatizado via Mercado Pago (ID: ${payoutResult.payoutId})`
    });
    res.json({
      success: true,
      route: updatedRoute,
      payoutId: payoutResult.payoutId,
      message: payoutResult.message
    });
  } catch (err) {
    console.error(`[API POST /api/admin/routes/${req.params.id}/pay-mercadopago error]`, err.message);
    res.status(500).json({ error: err.message });
  }
});
app.get("/api/admin/modalities", requireAdminAuth, async (req, res) => {
  try {
    const activeOnly = req.query.activeOnly === "true";
    const modalities = await deliveryConfigService.getModalities(activeOnly);
    res.json(modalities);
  } catch (err) {
    console.error("[API GET /api/admin/modalities error]", err.message);
    res.status(500).json({ error: err.message });
  }
});
app.post("/api/admin/modalities", requireAdminAuth, async (req, res) => {
  try {
    const { name, code } = req.body;
    const modality = await deliveryConfigService.createModality({ name, code });
    res.status(201).json(modality);
  } catch (err) {
    console.error("[API POST /api/admin/modalities error]", err.message);
    res.status(400).json({ error: err.message });
  }
});
app.patch("/api/admin/modalities/:id", requireAdminAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { name, active } = req.body;
    const updated = await deliveryConfigService.updateModality(id, { name, active });
    res.json(updated);
  } catch (err) {
    console.error(`[API PATCH /api/admin/modalities/${req.params.id} error]`, err.message);
    res.status(400).json({ error: err.message });
  }
});
app.get("/api/admin/neighborhoods", requireAdminAuth, async (req, res) => {
  try {
    const activeOnly = req.query.activeOnly === "true";
    const neighborhoodsList = await deliveryConfigService.getNeighborhoods(activeOnly);
    res.json(neighborhoodsList);
  } catch (err) {
    console.error("[API GET /api/admin/neighborhoods error]", err.message);
    res.status(500).json({ error: err.message });
  }
});
app.post("/api/admin/neighborhoods", requireAdminAuth, async (req, res) => {
  try {
    const { name } = req.body;
    const neighborhood = await deliveryConfigService.createNeighborhood(name);
    res.status(201).json(neighborhood);
  } catch (err) {
    console.error("[API POST /api/admin/neighborhoods error]", err.message);
    res.status(400).json({ error: err.message });
  }
});
app.patch("/api/admin/neighborhoods/:id", requireAdminAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { name, active } = req.body;
    const updated = await deliveryConfigService.updateNeighborhood(id, { name, active });
    res.json(updated);
  } catch (err) {
    console.error(`[API PATCH /api/admin/neighborhoods/${req.params.id} error]`, err.message);
    res.status(400).json({ error: err.message });
  }
});
app.get("/api/admin/delivery-config", requireAdminAuth, async (_req, res) => {
  try {
    const config = await deliveryConfigService.getDeliveryConfig();
    res.json(config);
  } catch (err) {
    console.error("[API GET /api/admin/delivery-config error]", err.message);
    res.status(500).json({ error: err.message });
  }
});
app.put("/api/admin/delivery-config", requireAdminAuth, async (req, res) => {
  try {
    const { key, value } = req.body;
    if (!["LOGISTICS_MANAGEMENT_RATE", "DEFAULT_ROUTE_DISCOUNT_PERCENT"].includes(key)) {
      return res.status(400).json({ error: "INVALID_CONFIG_KEY" });
    }
    const updated = await deliveryConfigService.updateDeliveryConfig(key, value);
    res.json(updated);
  } catch (err) {
    console.error("[API PUT /api/admin/delivery-config error]", err.message);
    res.status(400).json({ error: err.message });
  }
});
app.get("/api/admin/freight-prices", requireAdminAuth, async (req, res) => {
  try {
    const neighborhood_id = req.query.neighborhood_id ? parseInt(req.query.neighborhood_id, 10) : void 0;
    const modality_code = req.query.modality_code;
    const vehicle_category = req.query.vehicle_category;
    const activeOnly = req.query.activeOnly === "true";
    const prices = await deliveryConfigService.getFreightPrices({
      neighborhood_id,
      modality_code,
      vehicle_category,
      activeOnly
    });
    res.json(prices);
  } catch (err) {
    console.error("[API GET /api/admin/freight-prices error]", err.message);
    res.status(500).json({ error: err.message });
  }
});
app.post("/api/admin/freight-prices", requireAdminAuth, async (req, res) => {
  try {
    const { neighborhood_id, modality_code, vehicle_category, price, active } = req.body;
    const saved = await deliveryConfigService.upsertFreightPrice({
      neighborhood_id: parseInt(neighborhood_id, 10),
      modality_code: modality_code.trim().toUpperCase(),
      vehicle_category,
      price: typeof price === "number" ? price : parseFloat(String(price).replace(",", ".")),
      active
    });
    res.json(saved);
  } catch (err) {
    console.error("[API POST /api/admin/freight-prices error]", err.message);
    res.status(400).json({ error: err.message });
  }
});
app.get("/api/admin/freight-prices/suggested", requireAdminAuth, async (req, res) => {
  try {
    const neighborhood = req.query.neighborhood;
    const modality_code = req.query.modality_code || "CONVENCIONAL";
    const vehicle_category = req.query.vehicle_category || "CAR";
    if (!neighborhood) {
      return res.json({ price: 0, source: "NONE" });
    }
    const nId = parseInt(neighborhood, 10);
    const lookupTarget = isNaN(nId) ? neighborhood : nId;
    const result = await deliveryConfigService.getSuggestedFreightPrice(
      lookupTarget,
      modality_code.trim().toUpperCase(),
      vehicle_category
    );
    res.json(result);
  } catch (err) {
    console.error("[API GET /api/admin/freight-prices/suggested error]", err.message);
    res.status(500).json({ error: err.message });
  }
});
app.post("/api/admin/routes/calculate-pricing", requireAdminAuth, async (req, res) => {
  try {
    const { stops, management_rate, route_discount_percent } = req.body;
    if (!Array.isArray(stops)) {
      return res.status(400).json({ error: "STOPS_ARRAY_REQUIRED" });
    }
    const parsedStops = stops.map((s) => ({
      customer_freight: typeof s.customer_freight === "number" ? s.customer_freight : parseFloat(String(s.customer_freight || 0).replace(",", ".")) || 0
    }));
    const config = await deliveryConfigService.getDeliveryConfig();
    const result = deliveryConfigService.calculateRoutePricing(parsedStops, {
      logistics_management_rate: management_rate !== void 0 ? management_rate : config.logistics_management_rate,
      default_route_discount_percent: route_discount_percent !== void 0 ? route_discount_percent : config.default_route_discount_percent
    });
    res.json(result);
  } catch (err) {
    console.error("[API POST /api/admin/routes/calculate-pricing error]", err.message);
    res.status(400).json({ error: err.message });
  }
});
app.get("/api/admin/freight-engine/config", requireAdminAuth, async (_req, res) => {
  try {
    res.json({
      neighborhoods: UBERLANDIA_70_NEIGHBORHOODS,
      motoRadiusTable: MOTO_RADIUS_TARIFF_TABLE,
      parameters: DEFAULT_FREIGHT_PARAMETERS,
      pickupPresets: PICKUP_PRESETS
    });
  } catch (err) {
    console.error("[API GET /api/admin/freight-engine/config error]", err.message);
    res.status(500).json({ error: err.message });
  }
});
app.post("/api/admin/freight-engine/calculate", requireAdminAuth, async (req, res) => {
  try {
    const { modality, origin, stops, parameters } = req.body;
    if (!modality || !["CAR", "MOTO"].includes(modality)) {
      return res.status(400).json({ error: "INVALID_MODALITY: Modalidade deve ser CAR ou MOTO" });
    }
    if (!origin || !origin.name || !origin.address) {
      return res.status(400).json({ error: "INVALID_ORIGIN: Origem \xE9 obrigat\xF3ria" });
    }
    if (!Array.isArray(stops) || stops.length === 0) {
      return res.status(400).json({ error: "STOPS_REQUIRED: Ao menos uma parada \xE9 obrigat\xF3ria" });
    }
    const result = calculateRoutePricing(
      modality,
      origin,
      stops,
      parameters || DEFAULT_FREIGHT_PARAMETERS
    );
    res.json(result);
  } catch (err) {
    console.error("[API POST /api/admin/freight-engine/calculate error]", err.message);
    res.status(400).json({ error: err.message });
  }
});
app.post("/api/admin/freight-engine/whatsapp-proposal", requireAdminAuth, async (req, res) => {
  try {
    const { modality, originNameOrAddress, stops, driverFee, googleMapsUrl, observations } = req.body;
    const message = generateWhatsAppProposalMessage({
      modality: modality || "MOTO",
      originNameOrAddress: originNameOrAddress || "Kantine Matriz",
      stops: stops || [],
      driverFee: Number(driverFee) || 0,
      googleMapsUrl,
      observations
    });
    res.json({ message });
  } catch (err) {
    console.error("[API POST /api/admin/freight-engine/whatsapp-proposal error]", err.message);
    res.status(400).json({ error: err.message });
  }
});
app.post("/api/admin/freight-engine/seed-70-neighborhoods", requireAdminAuth, async (_req, res) => {
  try {
    let insertedNeighborhoods = 0;
    let insertedPrices = 0;
    for (const record of UBERLANDIA_70_NEIGHBORHOODS) {
      const neighborhood = await deliveryConfigService.findOrCreateNeighborhood(record.name);
      if (neighborhood) {
        insertedNeighborhoods++;
        await deliveryConfigService.upsertFreightPrice({
          neighborhood_id: neighborhood.id,
          modality_code: "CONVENCIONAL",
          vehicle_category: "CAR",
          price: record.carFee,
          active: true
        });
        insertedPrices++;
      }
    }
    res.json({
      success: true,
      total_neighborhoods: UBERLANDIA_70_NEIGHBORHOODS.length,
      seeded_neighborhoods: insertedNeighborhoods,
      seeded_prices: insertedPrices
    });
  } catch (err) {
    console.error("[API POST /api/admin/freight-engine/seed-70-neighborhoods error]", err.message);
    res.status(500).json({ error: err.message });
  }
});
app.get(
  [
    "/api/admin/freight-engine/export-excel",
    "/api/freight-engine/download-excel",
    "/api/freight-engine/download-excel/Tabela_de_Fretes.xlsx",
    "/api/freight-engine/download-excel/Tabela_de_Fretes_Kantine_Gastronomia_Uberlandia.xlsx"
  ],
  async (req, res) => {
    try {
      const exportDir = path3.resolve(__dirname, "public", "downloads");
      fs3.mkdirSync(exportDir, { recursive: true });
      const filePathShort = path3.join(exportDir, "Tabela_de_Fretes.xlsx");
      const filePathLong = path3.join(exportDir, "Tabela_de_Fretes_Kantine_Gastronomia_Uberlandia.xlsx");
      if (!fs3.existsSync(filePathShort) || !fs3.existsSync(filePathLong) || req.query.fresh === "true") {
        const wb = await generateFreightExcelWorkbook();
        await wb.xlsx.writeFile(filePathShort);
        await wb.xlsx.writeFile(filePathLong);
      }
      const requestedFile = req.path.endsWith("Tabela_de_Fretes_Kantine_Gastronomia_Uberlandia.xlsx") ? filePathLong : filePathShort;
      const downloadFilename = req.path.endsWith("Tabela_de_Fretes_Kantine_Gastronomia_Uberlandia.xlsx") ? "Tabela_de_Fretes_Kantine_Gastronomia_Uberlandia.xlsx" : "Tabela_de_Fretes.xlsx";
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${downloadFilename}"`);
      res.download(requestedFile, downloadFilename);
    } catch (err) {
      console.error("[API GET /api/freight-engine/download-excel error]", err.message);
      res.status(500).json({ error: "Falha ao gerar/baixar planilha Excel: " + err.message });
    }
  }
);
app.get("/api/driver/routes/:id", requireAdminAuth, async (req, res) => {
  try {
    const routeId = parseInt(req.params.id, 10);
    const route = await routeService.getRouteById(routeId);
    if (!route) {
      return res.status(404).json({ error: "Route not found" });
    }
    const driverSafe = routeService.sanitizeRouteForDriver(route);
    res.json(driverSafe);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get("/api/driver/routes/:id/navigation", requireAdminAuth, async (req, res) => {
  try {
    const routeId = parseInt(req.params.id, 10);
    const route = await routeService.getRouteById(routeId);
    if (!route) {
      return res.status(404).json({ error: "Route not found" });
    }
    if (!route.accepted_driver_id) {
      return res.status(403).json({ error: "FORBIDDEN_PRE_ACCEPTANCE" });
    }
    const driverId = route.accepted_driver_id;
    const navLinks = await routeService.getRouteNavigation(routeId, { driverId });
    res.json(navLinks);
  } catch (err) {
    if (err.message === "ROUTE_NOT_FOUND") {
      return res.status(404).json({ error: "Route not found" });
    }
    if (err.message === "DRIVER_NOT_FOUND" || err.message === "FORBIDDEN_PRE_ACCEPTANCE" || err.message === "FORBIDDEN_NOT_WINNING_DRIVER") {
      return res.status(403).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});
async function handleTakeatWebhook(req, res, explicitStoreKey) {
  try {
    const rawPayload = req.body;
    console.log(`[Takeat Webhook Received (${explicitStoreKey || "AUTO"})]`, JSON.stringify(rawPayload).slice(0, 300));
    const storeKeyToValidate = String(explicitStoreKey || "").toUpperCase() === "VINHEDOS" ? "VINHEDOS" : "MATRIZ";
    const config = await takeatService.getConfig(storeKeyToValidate);
    const expected = String(config.webhook_secret || process.env.TAKEAT_WEBHOOK_SECRET || "").trim();
    if (!expected) {
      return res.status(503).json({ error: "WEBHOOK_SECRET_NOT_CONFIGURED", details: `Cadastre o Webhook secret da loja ${storeKeyToValidate} nas configura\xE7\xF5es do Takeat.` });
    }
    const rawToken = String(req.headers["x-webhook-token"] || req.headers["authorization"] || req.headers["x-takeat-signature"] || "");
    const token = rawToken.replace(/^Bearer\s+/i, "").trim();
    const a = Buffer.from(token);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto2.timingSafeEqual(a, b)) {
      console.warn(`[Takeat Webhook ${storeKeyToValidate}] token inv\xE1lido \u2014 pedido recusado`);
      return res.status(401).json({ error: "INVALID_WEBHOOK_TOKEN" });
    }
    const result = await takeatService.processIncomingWebhook(rawPayload, explicitStoreKey);
    res.status(200).json({
      success: true,
      action: result.action,
      storeKey: result.storeKey,
      orderId: result.order.id,
      displayId: result.order.display_id,
      status: result.order.status,
      calculatedFreight: result.order.calculated_freight_value,
      routeId: result.order.created_route_id ?? null,
      draftError: result.draftError ?? null
    });
  } catch (err) {
    console.error("[Takeat Webhook Error]", err.message);
    res.status(500).json({ error: "FAILED_TO_PROCESS_TAKEAT_WEBHOOK", details: err.message });
  }
}
app.post("/api/webhooks/takeat/matriz", async (req, res) => {
  await handleTakeatWebhook(req, res, "MATRIZ");
});
app.post("/api/webhooks/takeat/vinhedos", async (req, res) => {
  await handleTakeatWebhook(req, res, "VINHEDOS");
});
app.post("/api/webhooks/takeat", async (req, res) => {
  const storeParam = req.query.store || req.query.loja || void 0;
  await handleTakeatWebhook(req, res, storeParam);
});
app.get("/api/admin/takeat/configs", requireAdminAuth, async (_req, res) => {
  try {
    const all = await takeatService.getAllConfigs();
    res.json({
      MATRIZ: {
        ...all.MATRIZ,
        has_api_key: Boolean(all.MATRIZ.api_key && all.MATRIZ.api_key.trim().length > 0),
        has_webhook_secret: Boolean(all.MATRIZ.webhook_secret && all.MATRIZ.webhook_secret.trim().length > 0)
      },
      VINHEDOS: {
        ...all.VINHEDOS,
        has_api_key: Boolean(all.VINHEDOS.api_key && all.VINHEDOS.api_key.trim().length > 0),
        has_webhook_secret: Boolean(all.VINHEDOS.webhook_secret && all.VINHEDOS.webhook_secret.trim().length > 0)
      }
    });
  } catch (err) {
    console.error("[API GET /api/admin/takeat/configs error]", err.message);
    res.status(500).json({ error: err.message });
  }
});
app.get("/api/admin/takeat/config", requireAdminAuth, async (req, res) => {
  try {
    const storeKey = req.query.store?.toUpperCase() === "VINHEDOS" ? "VINHEDOS" : "MATRIZ";
    const config = await takeatService.getConfig(storeKey);
    res.json({
      ...config,
      has_api_key: Boolean(config.api_key && config.api_key.trim().length > 0),
      has_webhook_secret: Boolean(config.webhook_secret && config.webhook_secret.trim().length > 0)
    });
  } catch (err) {
    console.error("[API GET /api/admin/takeat/config error]", err.message);
    res.status(500).json({ error: err.message });
  }
});
app.post("/api/admin/takeat/config", requireAdminAuth, async (req, res) => {
  try {
    const {
      store_key,
      store_name,
      api_key,
      webhook_secret,
      store_id,
      default_pickup_preset,
      auto_calculate_freight,
      preferred_modality,
      notification_sound_enabled,
      is_active
    } = req.body;
    const targetStore = String(store_key).toUpperCase() === "VINHEDOS" ? "VINHEDOS" : "MATRIZ";
    const saved = await takeatService.saveConfig(targetStore, {
      store_name,
      api_key,
      webhook_secret,
      store_id,
      default_pickup_preset,
      auto_calculate_freight,
      preferred_modality,
      notification_sound_enabled,
      is_active
    });
    res.json({
      ...saved,
      has_api_key: Boolean(saved.api_key && saved.api_key.trim().length > 0),
      has_webhook_secret: Boolean(saved.webhook_secret && saved.webhook_secret.trim().length > 0)
    });
  } catch (err) {
    console.error("[API POST /api/admin/takeat/config error]", err.message);
    res.status(400).json({ error: err.message });
  }
});
app.get("/api/admin/takeat/orders", requireAdminAuth, async (req, res) => {
  try {
    const status = req.query.status || void 0;
    const store = req.query.store || void 0;
    const orders = await takeatService.getOrders(status, store);
    const pendingCounts = await takeatService.getPendingCount();
    res.json({
      orders,
      pendingCount: pendingCounts.total,
      pendingCounts
    });
  } catch (err) {
    console.error("[API GET /api/admin/takeat/orders error]", err.message);
    res.status(500).json({ error: err.message });
  }
});
app.get("/api/admin/takeat/pending-count", requireAdminAuth, async (_req, res) => {
  try {
    const counts = await takeatService.getPendingCount();
    res.json({ count: counts.total, ...counts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post("/api/admin/takeat/simulate", requireAdminAuth, async (req, res) => {
  try {
    const { storeKey, store_key, neighborhood, items, customerName, total } = req.body;
    const targetStore = String(storeKey || store_key || "").toUpperCase() === "VINHEDOS" ? "VINHEDOS" : "MATRIZ";
    const order = await takeatService.simulateTestOrder({
      storeKey: targetStore,
      neighborhood,
      items,
      customerName,
      total
    });
    const pendingCounts = await takeatService.getPendingCount();
    res.json({ success: true, order, pendingCount: pendingCounts.total, pendingCounts });
  } catch (err) {
    console.error("[API POST /api/admin/takeat/simulate error]", err.message);
    res.status(500).json({ error: err.message });
  }
});
app.post("/api/admin/takeat/sync", requireAdminAuth, async (req, res) => {
  try {
    const storeKey = (req.body?.storeKey || req.body?.store_key || "MATRIZ").toUpperCase() === "VINHEDOS" ? "VINHEDOS" : "MATRIZ";
    const result = await takeatService.syncOrdersFromRestApi(storeKey);
    const pendingCounts = await takeatService.getPendingCount();
    res.json({
      ...result,
      pendingCount: pendingCounts.total,
      pendingCounts
    });
  } catch (err) {
    console.error("[API POST /api/admin/takeat/sync error]", err.message);
    res.status(400).json({ error: err.message });
  }
});
app.post("/api/admin/takeat/orders/:id/create-route", requireAdminAuth, async (req, res) => {
  try {
    const orderId = parseInt(req.params.id, 10);
    if (isNaN(orderId)) return res.status(400).json({ error: "INVALID_ORDER_ID" });
    const { offerNow, modality, pickupPreset } = req.body;
    const result = await takeatService.convertOrderToRoute(orderId, {
      offerNow: Boolean(offerNow),
      modality: modality || "MOTO",
      pickupPreset
    });
    res.json({
      success: true,
      route: result.route,
      order: result.order
    });
  } catch (err) {
    console.error(`[API POST /api/admin/takeat/orders/${req.params.id}/create-route error]`, err.message);
    res.status(400).json({ error: err.message });
  }
});
app.post("/api/admin/takeat/orders/:id/dismiss", requireAdminAuth, async (req, res) => {
  try {
    const orderId = parseInt(req.params.id, 10);
    if (isNaN(orderId)) return res.status(400).json({ error: "INVALID_ORDER_ID" });
    const updated = await takeatService.dismissOrder(orderId);
    res.json({ success: true, order: updated });
  } catch (err) {
    console.error(`[API POST /api/admin/takeat/orders/${req.params.id}/dismiss error]`, err.message);
    res.status(400).json({ error: err.message });
  }
});
app.delete("/api/admin/takeat/orders/:id", requireAdminAuth, async (req, res) => {
  try {
    const orderId = parseInt(req.params.id, 10);
    if (isNaN(orderId)) return res.status(400).json({ error: "INVALID_ORDER_ID" });
    await takeatService.deleteOrder(orderId);
    res.json({ success: true });
  } catch (err) {
    console.error(`[API DELETE /api/admin/takeat/orders/${req.params.id} error]`, err.message);
    res.status(500).json({ error: err.message });
  }
});
app.all("/api/*", (_req, res) => {
  res.status(404).json({ error: "API_ENDPOINT_NOT_FOUND", message: "Rota de API n\xE3o encontrada" });
});
app.get("/favicon.ico", (_req, res) => {
  const icoPath = path3.resolve(__dirname, "public", "favicon.ico");
  if (fs3.existsSync(icoPath)) {
    res.type("image/x-icon");
    return res.sendFile(icoPath);
  }
  const svgPath = path3.resolve(__dirname, "public", "logo_kantine.svg");
  if (fs3.existsSync(svgPath)) {
    res.type("image/svg+xml");
    return res.sendFile(svgPath);
  }
  res.status(204).end();
});
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true, allowedHosts: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path3.resolve(__dirname, "dist");
    const indexPath = path3.resolve(distPath, "index.html");
    if (fs3.existsSync(distPath)) {
      app.use(express.static(distPath));
    }
    app.get("*", (_req, res) => {
      if (fs3.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(200).send(`<!doctype html><html><head><meta charset="UTF-8"><title>Kantine Delivery</title></head><body><div id="root">Carregando Kantine Delivery...</div></body></html>`);
      }
    });
  }
  app.use((err, _req, res, _next) => {
    console.error("[Express Global Error]:", err?.stack || err?.message || err);
    if (!res.headersSent) {
      res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: err?.message || "Erro interno no servidor" });
    }
  });
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Kantine Delivery M1] Server running on http://0.0.0.0:${PORT}`);
  });
  initDbConstraints().catch((err) => {
    console.error("[initDbConstraints] Startup check warning:", err.message);
  });
  setInterval(() => {
    scheduleService.tick().then((r) => {
      if (r.published || r.failed) console.log("[agendador]", JSON.stringify(r));
    }).catch((e) => console.warn("[agendador]", e?.message));
  }, 6e4);
  telegramBot.start().catch((err) => {
    console.error("[Kantine Delivery M1] Telegram Bot start error:", err.message);
  });
}
startServer().catch((err) => {
  console.error("[Kantine Delivery M1] Startup error:", err);
  process.exit(1);
});
