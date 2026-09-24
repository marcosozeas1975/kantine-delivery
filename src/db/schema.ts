import { sql } from 'drizzle-orm';
import { check, integer, pgTable, serial, text, timestamp, unique } from 'drizzle-orm/pg-core';

// Firebase Auth Admin Users
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Drivers Table (M1 Baseline)
export const drivers = pgTable(
  'drivers',
  {
    id: serial('id').primaryKey(),
    telegram_user_id: text('telegram_user_id').notNull().unique(),
    telegram_chat_id: text('telegram_chat_id').notNull(),
    name: text('name').notNull(),
    phone: text('phone').notNull(),
    vehicle_type: text('vehicle_type').notNull(), // CAR_HATCH | CAR_SEDAN | CAR_SW | MOTO_WITH_BAG | MOTO_WITHOUT_BAG | OTHER
    pix_key: text('pix_key').notNull(),
    status: text('status').notNull().default('PENDING'), // PENDING | ACTIVE | BLOCKED
    created_at: timestamp('created_at').defaultNow().notNull(),
    updated_at: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    check('drivers_status_check', sql`${table.status} IN ('PENDING', 'ACTIVE', 'BLOCKED')`),
    check(
      'drivers_vehicle_type_canonical_check',
      sql`${table.vehicle_type} IN ('CAR_HATCH', 'CAR_SEDAN', 'CAR_SW', 'MOTO_WITH_BAG', 'MOTO_WITHOUT_BAG', 'OTHER')`
    ),
  ]
);

// Driver Audit Events (M1 Baseline)
export const driverEvents = pgTable('driver_events', {
  id: serial('id').primaryKey(),
  driver_id: integer('driver_id').references(() => drivers.id, { onDelete: 'cascade' }).notNull(),
  event_type: text('event_type').notNull(), // DRIVER_REGISTERED | DRIVER_APPROVED | DRIVER_BLOCKED | DRIVER_REACTIVATED
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
    status: text('status').notNull().default('DRAFT'), // DRAFT | OFFERED | CANCELLED
    created_at: timestamp('created_at').defaultNow().notNull(),
    offered_at: timestamp('offered_at'),
  },
  (table) => [
    check('deliveries_status_check', sql`${table.status} IN ('DRAFT', 'OFFERED', 'CANCELLED')`),
    check('deliveries_mode_check', sql`${table.delivery_mode} IN ('IN_PERSON', 'NO_CONTACT')`),
  ]
);

// Delivery Offer Dispatches Table (M2)
export const deliveryOfferDispatches = pgTable(
  'delivery_offer_dispatches',
  {
    id: serial('id').primaryKey(),
    delivery_id: integer('delivery_id').references(() => deliveries.id, { onDelete: 'cascade' }).notNull(),
    driver_id: integer('driver_id').references(() => drivers.id, { onDelete: 'cascade' }).notNull(),
    telegram_chat_id: text('telegram_chat_id').notNull(),
    status: text('status').notNull(), // SENT | FAILED
    sent_at: timestamp('sent_at').defaultNow().notNull(),
    error_code: text('error_code'),
  },
  (table) => [
    check('dispatches_status_check', sql`${table.status} IN ('SENT', 'FAILED')`),
    unique('delivery_driver_unique').on(table.delivery_id, table.driver_id),
  ]
);

// Delivery Events Audit Table (M2)
export const deliveryEvents = pgTable('delivery_events', {
  id: serial('id').primaryKey(),
  delivery_id: integer('delivery_id').references(() => deliveries.id, { onDelete: 'cascade' }).notNull(),
  event_type: text('event_type').notNull(), // DELIVERY_CREATED | DELIVERY_OFFERED | DELIVERY_CANCELLED
  timestamp: timestamp('timestamp').defaultNow().notNull(),
  actor: text('actor'),
});
