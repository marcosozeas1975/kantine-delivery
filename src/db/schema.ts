import { sql } from 'drizzle-orm';
import { check, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

// Firebase Auth Admin Users
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Drivers Table
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

// Driver Audit Events
export const driverEvents = pgTable('driver_events', {
  id: serial('id').primaryKey(),
  driver_id: integer('driver_id').references(() => drivers.id, { onDelete: 'cascade' }).notNull(),
  event_type: text('event_type').notNull(), // DRIVER_REGISTERED | DRIVER_APPROVED | DRIVER_BLOCKED | DRIVER_REACTIVATED
  timestamp: timestamp('timestamp').defaultNow().notNull(),
});
