import { sql } from 'drizzle-orm';
import { boolean, check, integer, numeric, pgTable, serial, text, timestamp, unique } from 'drizzle-orm/pg-core';

// Firebase Auth Admin Users
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Drivers Table (M1 Baseline + M1.1 Cadastral Management + Exclusion & Reactivation Lifecycle)
export const drivers = pgTable(
  'drivers',
  {
    id: serial('id').primaryKey(),
    telegram_user_id: text('telegram_user_id').notNull().unique(),
    telegram_chat_id: text('telegram_chat_id').notNull(),
    name: text('name').notNull(),
    phone: text('phone').notNull(),
    vehicle_type: text('vehicle_type').notNull(), // CAR_HATCH | CAR_SEDAN | CAR_SW | MOTO_WITH_BAG | MOTO_WITHOUT_BAG | OTHER
    pix_key: text('pix_key'), // Kept for backward compatibility
    pix_key_type: text('pix_key_type').notNull().default('REQUIRES_UPDATE'), // CPF | PHONE | EMAIL | RANDOM | REQUIRES_UPDATE
    pix_key_value: text('pix_key_value'),
    status: text('status').notNull().default('PENDING'), // PENDING | ACTIVE | BLOCKED | EXCLUDED
    // Exclusion fields & historical memory
    is_excluded: boolean('is_excluded').default(false).notNull(),
    excluded_at: timestamp('excluded_at'),
    exclusion_reason: text('exclusion_reason'),
    excluded_by: text('excluded_by'),
    previous_exclusion_reason: text('previous_exclusion_reason'),
    exclusion_count: integer('exclusion_count').default(0).notNull(),
    // Blocked Reactivation Request fields
    reactivation_requested: boolean('reactivation_requested').default(false).notNull(),
    reactivation_requested_at: timestamp('reactivation_requested_at'),
    reactivation_reason: text('reactivation_reason'),
    // Excluded Reinclusion Request fields
    reinclusion_requested: boolean('reinclusion_requested').default(false).notNull(),
    reinclusion_requested_at: timestamp('reinclusion_requested_at'),
    reinclusion_reason: text('reinclusion_reason'),
    created_at: timestamp('created_at').defaultNow().notNull(),
    updated_at: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    check('drivers_status_check', sql`${table.status} IN ('PENDING', 'ACTIVE', 'BLOCKED', 'EXCLUDED')`),
    check(
      'drivers_vehicle_type_canonical_check',
      sql`${table.vehicle_type} IN ('CAR', 'MOTO', 'MOTO_WITH_BAG', 'CAR_HATCH', 'CAR_SEDAN', 'CAR_SW', 'MOTO_WITHOUT_BAG', 'OTHER')`
    ),
    check(
      'drivers_pix_key_type_check',
      sql`${table.pix_key_type} IN ('CPF', 'PHONE', 'EMAIL', 'RANDOM', 'REQUIRES_UPDATE')`
    ),
  ]
);

// Driver Audit Events (M1 Baseline + M1.1 Audit)
export const driverEvents = pgTable('driver_events', {
  id: serial('id').primaryKey(),
  driver_id: integer('driver_id').references(() => drivers.id, { onDelete: 'cascade' }).notNull(),
  event_type: text('event_type').notNull(), // DRIVER_REGISTERED | DRIVER_APPROVED | DRIVER_BLOCKED | DRIVER_REACTIVATED | DRIVER_PROFILE_UPDATED
  actor_type: text('actor_type'), // DRIVER | ADMIN | SYSTEM
  actor_id: text('actor_id'),
  field_changed: text('field_changed'), // name | phone | vehicle_type | pix
  old_value: text('old_value'),
  new_value: text('new_value'),
  details: text('details'),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
});

// Deliveries Table (M2)
export const deliveries = pgTable(
  'deliveries',
  {
    id: serial('id').primaryKey(),
    pickup_location: text('pickup_location').notNull().default('Kantine Matriz'),
    destination_address: text('destination_address').notNull(),
    destination_neighborhood: text('destination_neighborhood').notNull(),
    cargo_description: text('cargo_description').notNull(),
    delivery_fee: text('delivery_fee').notNull(),
    delivery_mode: text('delivery_mode').notNull().default('IN_PERSON'), // IN_PERSON | NO_CONTACT
    observations: text('observations'),
    status: text('status').notNull().default('DRAFT'), // DRAFT | OFFERED | ACCEPTED | CANCELLED
    created_at: timestamp('created_at').defaultNow().notNull(),
    offered_at: timestamp('offered_at'),
    accepted_driver_id: integer('accepted_driver_id').references(() => drivers.id, { onDelete: 'set null' }),
    accepted_at: timestamp('accepted_at'),
  },
  (table) => [
    check('deliveries_status_check', sql`${table.status} IN ('DRAFT', 'OFFERED', 'ACCEPTED', 'CANCELLED')`),
    check('deliveries_mode_check', sql`${table.delivery_mode} IN ('IN_PERSON', 'NO_CONTACT')`),
    check(
      'deliveries_accepted_integrity_check',
      sql`(${table.status} = 'ACCEPTED' AND ${table.accepted_driver_id} IS NOT NULL AND ${table.accepted_at} IS NOT NULL) OR (${table.status} != 'ACCEPTED')`
    ),
  ]
);

// Delivery Offer Dispatches Table (M2/M3)
export const deliveryOfferDispatches = pgTable(
  'delivery_offer_dispatches',
  {
    id: serial('id').primaryKey(),
    delivery_id: integer('delivery_id').references(() => deliveries.id, { onDelete: 'cascade' }).notNull(),
    driver_id: integer('driver_id').references(() => drivers.id, { onDelete: 'cascade' }).notNull(),
    telegram_chat_id: text('telegram_chat_id').notNull(),
    telegram_message_id: text('telegram_message_id'),
    status: text('status').notNull(), // SENT | FAILED
    sent_at: timestamp('sent_at').defaultNow().notNull(),
    error_code: text('error_code'),
  },
  (table) => [
    check('dispatches_status_check', sql`${table.status} IN ('SENT', 'FAILED')`),
  ]
);

// Delivery Events Audit Table (M2/M3)
export const deliveryEvents = pgTable('delivery_events', {
  id: serial('id').primaryKey(),
  delivery_id: integer('delivery_id').references(() => deliveries.id, { onDelete: 'cascade' }).notNull(),
  event_type: text('event_type').notNull(), // DELIVERY_CREATED | DELIVERY_OFFERED | DELIVERY_ACCEPTED | DELIVERY_CANCELLED
  timestamp: timestamp('timestamp').defaultNow().notNull(),
  actor: text('actor'),
});

// ==========================================
// M2.1 — Multi-Stop Routes & Pickup Locations
// ==========================================

// Pickup Locations Table (M2.1 Pontos de Coleta)
export const pickupLocations = pgTable('pickup_locations', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  address: text('address').notNull(),
  neighborhood: text('neighborhood'), // Bairro da coleta estruturado
  active: boolean('active').default(true).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// ==========================================
// M4.2 — Delivery Modalities, Neighborhoods, Pricing Matrix & Config
// ==========================================

export const deliveryModalities = pgTable('delivery_modalities', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(), // e.g. Bolo, Cesta, Convencional
  code: text('code').notNull().unique(), // e.g. BOLO, CESTA, CONVENCIONAL
  active: boolean('active').default(true).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

export const neighborhoods = pgTable('neighborhoods', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  normalized_name: text('normalized_name').notNull().unique(),
  active: boolean('active').default(true).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

export const deliveryConfigurations = pgTable('delivery_configurations', {
  key: text('key').primaryKey(), // LOGISTICS_MANAGEMENT_RATE, DEFAULT_ROUTE_DISCOUNT_PERCENT
  value: text('value').notNull(),
  description: text('description'),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

export const freightPrices = pgTable(
  'freight_prices',
  {
    id: serial('id').primaryKey(),
    neighborhood_id: integer('neighborhood_id').references(() => neighborhoods.id, { onDelete: 'cascade' }).notNull(),
    modality_code: text('modality_code').notNull(),
    vehicle_category: text('vehicle_category').notNull(), // CAR | MOTO | MOTO_WITH_BAG
    price: numeric('price', { precision: 10, scale: 2 }).notNull(),
    active: boolean('active').default(true).notNull(),
    created_at: timestamp('created_at').defaultNow().notNull(),
    updated_at: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    check(
      'freight_vehicle_category_check',
      sql`${table.vehicle_category} IN ('CAR', 'MOTO', 'MOTO_WITH_BAG')`
    ),
  ]
);

// Routes Table (M2.1 & M4 Multi-Stop Routes + M4.2 Precificação de Rotas)
export const routes = pgTable(
  'routes',
  {
    id: serial('id').primaryKey(),
    pickup_type: text('pickup_type').notNull().default('REGISTERED'), // REGISTERED | AD_HOC
    pickup_location_id: integer('pickup_location_id').references(() => pickupLocations.id, { onDelete: 'set null' }),
    pickup_name: text('pickup_name').notNull(),
    pickup_address: text('pickup_address').notNull(),
    pickup_neighborhood_snapshot: text('pickup_neighborhood_snapshot'),
    final_deadline: text('final_deadline').notNull(),
    total_fee: text('total_fee').notNull(),
    accepted_vehicle_types: text('accepted_vehicle_types').notNull(), // JSON array string e.g. ["CAR_HATCH","MOTO_WITH_BAG"]
    status: text('status').notNull().default('DRAFT'), // DRAFT | OFFERED | ACCEPTED | ARRIVED_PICKUP | PICKED_UP | IN_TRANSIT | COMPLETED | CANCELLED
    accepted_driver_id: integer('accepted_driver_id').references(() => drivers.id, { onDelete: 'set null' }),
    accepted_at: timestamp('accepted_at'),
    arrived_pickup_at: timestamp('arrived_pickup_at'),
    picked_up_at: timestamp('picked_up_at'),
    started_at: timestamp('started_at'),
    completed_at: timestamp('completed_at'),
    payment_status: text('payment_status').notNull().default('PENDING'), // PENDING | PAID
    paid_at: timestamp('paid_at'),
    paid_by: text('paid_by'),
    payment_method: text('payment_method').default('PIX'),
    payment_reference: text('payment_reference'),
    payment_note: text('payment_note'),
    // M4.2 Campos Financeiros & Precificação
    customer_freight_total: numeric('customer_freight_total', { precision: 10, scale: 2 }),
    management_rate_snapshot: numeric('management_rate_snapshot', { precision: 6, scale: 4 }),
    management_amount_total: numeric('management_amount_total', { precision: 10, scale: 2 }),
    route_base_amount: numeric('route_base_amount', { precision: 10, scale: 2 }),
    route_discount_percent_snapshot: numeric('route_discount_percent_snapshot', { precision: 6, scale: 4 }),
    suggested_driver_fee: numeric('suggested_driver_fee', { precision: 10, scale: 2 }),
    final_driver_fee: numeric('final_driver_fee', { precision: 10, scale: 2 }),
    override_reason: text('override_reason'),
    // M4.4 Versionamento e Edição Controlada
    route_version: integer('route_version').default(1).notNull(),
    driver_acknowledged_version: integer('driver_acknowledged_version').default(1).notNull(),
    change_pending_driver_approval: boolean('change_pending_driver_approval').default(false).notNull(),
    pending_material_change: text('pending_material_change'),
    created_at: timestamp('created_at').defaultNow().notNull(),
    offered_at: timestamp('offered_at'),
  },
  (table) => [
    check(
      'routes_status_check',
      sql`${table.status} IN ('DRAFT', 'OFFERED', 'ACCEPTED', 'ARRIVED_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED')`
    ),
    check('routes_pickup_type_check', sql`${table.pickup_type} IN ('REGISTERED', 'AD_HOC')`),
    check(
      'routes_accepted_integrity_check',
      sql`(${table.status} IN ('ACCEPTED', 'ARRIVED_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'COMPLETED') AND ${table.accepted_driver_id} IS NOT NULL AND ${table.accepted_at} IS NOT NULL) OR (${table.status} NOT IN ('ACCEPTED', 'ARRIVED_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'COMPLETED'))`
    ),
    check('routes_payment_status_check', sql`${table.payment_status} IN ('PENDING', 'PAID')`),
  ]
);

// Route Stops Table (M2.1 & M4 Paradas da Rota + M4.1 Resolução de Incidentes + M4.2 Precificação por Parada)
export const routeStops = pgTable(
  'route_stops',
  {
    id: serial('id').primaryKey(),
    route_id: integer('route_id').references(() => routes.id, { onDelete: 'cascade' }).notNull(),
    sequence: integer('sequence').notNull(),
    destination_address: text('destination_address').notNull(),
    destination_neighborhood: text('destination_neighborhood').notNull(),
    cargo_description: text('cargo_description').notNull(),
    delivery_mode: text('delivery_mode').notNull().default('IN_PERSON'), // IN_PERSON | NO_CONTACT
    observations: text('observations'),
    desired_deadline: text('desired_deadline'), // optional (ex: 16:30)
    status: text('status').notNull().default('PENDING'), // PENDING | DELIVERED | INCIDENT | CANCELLED
    pin_code: text('pin_code'), // 4-digit PIN for IN_PERSON proof
    delivered_at: timestamp('delivered_at'),
    proof_type: text('proof_type'), // PIN | PHOTO
    proof_reference: text('proof_reference'), // Telegram file_id or evidence reference
    incident_type: text('incident_type'), // CLIENTE_AUSENTE | ENDERECO_NAO_LOCALIZADO | CLIENTE_RECUSOU | OUTRO
    incident_note: text('incident_note'),
    incident_at: timestamp('incident_at'),
    incident_resolution_status: text('incident_resolution_status'), // OPEN | RESOLVED
    resolution_type: text('resolution_type'), // RETURN_TO_ORIGIN | DELIVERED_LATER | DELIVERED_TO_ALTERNATIVE_LOCATION | CUSTOMER_PICKUP | DISCARDED | OTHER
    resolution_note: text('resolution_note'),
    resolved_at: timestamp('resolved_at'),
    resolved_by: text('resolved_by'),
    // M4.2 Modalidade, Bairro e Frete Cobrado do Cliente por Parada
    modality_code: text('modality_code').default('CONVENCIONAL').notNull(),
    neighborhood_id: integer('neighborhood_id').references(() => neighborhoods.id, { onDelete: 'set null' }),
    pricing_vehicle_category: text('pricing_vehicle_category'), // CAR | MOTO | MOTO_WITH_BAG
    customer_freight: numeric('customer_freight', { precision: 10, scale: 2 }),
    net_delivery_base: numeric('net_delivery_base', { precision: 10, scale: 2 }),
    management_amount: numeric('management_amount', { precision: 10, scale: 2 }),
    created_at: timestamp('created_at').defaultNow().notNull(),
    completed_at: timestamp('completed_at'),
  },
  (table) => [
    check('route_stops_status_check', sql`${table.status} IN ('PENDING', 'DELIVERED', 'INCIDENT', 'CANCELLED')`),
    check('route_stops_mode_check', sql`${table.delivery_mode} IN ('IN_PERSON', 'NO_CONTACT')`),
    check(
      'route_stops_resolution_status_check',
      sql`${table.incident_resolution_status} IS NULL OR ${table.incident_resolution_status} IN ('OPEN', 'RESOLVED')`
    ),
    check(
      'route_stops_resolution_type_check',
      sql`${table.resolution_type} IS NULL OR ${table.resolution_type} IN ('RETURN_TO_ORIGIN', 'DELIVERED_LATER', 'DELIVERED_TO_ALTERNATIVE_LOCATION', 'CUSTOMER_PICKUP', 'DISCARDED', 'OTHER')`
    ),
  ]
);

// Route Offer Dispatches Table (M2.1 Dispatch Idempotency)
export const routeOfferDispatches = pgTable(
  'route_offer_dispatches',
  {
    id: serial('id').primaryKey(),
    route_id: integer('route_id').references(() => routes.id, { onDelete: 'cascade' }).notNull(),
    route_version: integer('route_version').default(1).notNull(),
    driver_id: integer('driver_id').references(() => drivers.id, { onDelete: 'cascade' }).notNull(),
    telegram_chat_id: text('telegram_chat_id').notNull(),
    telegram_message_id: text('telegram_message_id'),
    status: text('status').notNull(), // SENT | FAILED
    sent_at: timestamp('sent_at').defaultNow().notNull(),
    error_code: text('error_code'),
  },
  (table) => [
    check('route_dispatches_status_check', sql`${table.status} IN ('SENT', 'FAILED')`),
  ]
);

// Route Events Audit Table (M2.1 Auditoria de Rotas)
export const routeEvents = pgTable('route_events', {
  id: serial('id').primaryKey(),
  route_id: integer('route_id').references(() => routes.id, { onDelete: 'cascade' }).notNull(),
  event_type: text('event_type').notNull(), // ROUTE_CREATED | ROUTE_OFFERED | ROUTE_ACCEPTED | ROUTE_CANCELLED | ROUTE_STOP_CREATED | ROUTE_STOP_REORDERED | ROUTE_UPDATED | ROUTE_CHANGE_ACCEPTED | ROUTE_CHANGE_REJECTED
  timestamp: timestamp('timestamp').defaultNow().notNull(),
  actor: text('actor'),
  details: text('details'),
});

// Route Updates & Version Snapshots Table (M4.4 Edição Controlada e Versionamento)
export const routeUpdates = pgTable(
  'route_updates',
  {
    id: serial('id').primaryKey(),
    route_id: integer('route_id').references(() => routes.id, { onDelete: 'cascade' }).notNull(),
    old_version: integer('old_version').notNull(),
    new_version: integer('new_version').notNull(),
    change_type: text('change_type').notNull(), // OPERATIONAL | MATERIAL | DRAFT_EDIT | OFFERED_REOFFER
    changed_fields: text('changed_fields').notNull(), // JSON string e.g. ["destination_address"]
    diff_summary: text('diff_summary').notNull(), // Resumo legível das diferenças
    previous_snapshot: text('previous_snapshot').notNull(), // JSON do estado anterior da rota e paradas
    new_snapshot: text('new_snapshot'), // JSON do estado resultante após alteração (ou null se pendente)
    pending_proposal: text('pending_proposal'), // Proposta pendente se alteração material
    actor: text('actor').notNull(), // Identificação do autor da alteração
    driver_approval_status: text('driver_approval_status').default('NOT_REQUIRED').notNull(), // NOT_REQUIRED | PENDING | ACCEPTED | REJECTED
    driver_decision_at: timestamp('driver_decision_at'),
    driver_acknowledged_at: timestamp('driver_acknowledged_at'),
    created_at: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    check(
      'route_updates_change_type_check',
      sql`${table.change_type} IN ('OPERATIONAL', 'MATERIAL', 'DRAFT_EDIT', 'OFFERED_REOFFER')`
    ),
    check(
      'route_updates_approval_status_check',
      sql`${table.driver_approval_status} IN ('NOT_REQUIRED', 'PENDING', 'ACCEPTED', 'REJECTED')`
    ),
  ]
);

// Driver Invitations Table (Convites de Motoristas para Telegram)
export const driverInvitations = pgTable(
  'driver_invitations',
  {
    id: serial('id').primaryKey(),
    token: text('token').notNull().unique(),
    name: text('name'),
    phone: text('phone'),
    vehicle_type: text('vehicle_type'),
    status: text('status').notNull().default('PENDING'), // PENDING | COMPLETED | CANCELLED
    created_by: text('created_by'),
    telegram_user_id: text('telegram_user_id'),
    driver_id: integer('driver_id').references(() => drivers.id, { onDelete: 'set null' }),
    created_at: timestamp('created_at').defaultNow().notNull(),
    completed_at: timestamp('completed_at'),
  },
  (table) => [
    check('driver_invitations_status_check', sql`${table.status} IN ('PENDING', 'COMPLETED', 'CANCELLED')`),
  ]
);

// Driver Referrals Table (M1.2 Rede Fechada de Indicação de Motoristas)
export const driverReferrals = pgTable(
  'driver_referrals',
  {
    id: serial('id').primaryKey(),
    referred_by_driver_id: integer('referred_by_driver_id')
      .references(() => drivers.id, { onDelete: 'cascade' })
      .notNull(),
    referred_name: text('referred_name').notNull(),
    referred_phone: text('referred_phone').notNull(),
    status: text('status').notNull().default('PENDING_REVIEW'), // PENDING_REVIEW | APPROVED | REJECTED | INVITE_USED | EXPIRED
    invitation_token: text('invitation_token').unique(),
    invitation_expires_at: timestamp('invitation_expires_at'),
    invitation_used_at: timestamp('invitation_used_at'),
    invited_telegram_user_id: text('invited_telegram_user_id'),
    resulting_driver_id: integer('resulting_driver_id').references(() => drivers.id, { onDelete: 'set null' }),
    reviewed_at: timestamp('reviewed_at'),
    reviewed_by: text('reviewed_by'),
    rejection_reason: text('rejection_reason'),
    created_at: timestamp('created_at').defaultNow().notNull(),
    updated_at: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    check(
      'driver_referrals_status_check',
      sql`${table.status} IN ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'INVITE_USED', 'EXPIRED')`
    ),
  ]
);

// Driver Referral Audit Events Table (M1.2 Auditoria de Indicações)
export const driverReferralEvents = pgTable('driver_referral_events', {
  id: serial('id').primaryKey(),
  referral_id: integer('referral_id').references(() => driverReferrals.id, { onDelete: 'cascade' }).notNull(),
  event_type: text('event_type').notNull(), // DRIVER_REFERRAL_CREATED | DRIVER_REFERRAL_APPROVED | DRIVER_REFERRAL_REJECTED | DRIVER_INVITE_CONSUMED | DRIVER_REFERRAL_EXPIRED
  actor_type: text('actor_type').notNull(), // DRIVER | ADMIN | SYSTEM
  actor_id: text('actor_id'),
  details: text('details'),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
});

