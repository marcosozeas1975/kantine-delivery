import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';
import * as schema from './schema.ts';

declare global {
  var _postgresPool: Pool | undefined;
}

export const createPool = () => {
  if (!global._postgresPool) {
    const targetDatabase =
      process.env.FORCE_DEV_DB === 'true'
        ? (process.env.SQL_DB_NAME || 'cloud_sql_development_database')
        : 'cloud_sql_production_database';

    global._postgresPool = new Pool({
      host: process.env.SQL_HOST,
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      database: targetDatabase,
      max: 10,
      connectionTimeoutMillis: 15000,
      idleTimeoutMillis: 30000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
    });

    global._postgresPool.on('error', (err: any) => {
      // Prevent idle client termination or unexpected server-side socket close from crashing Node process
      console.warn('[Postgres Pool] Idle client connection issue (non-fatal, auto-recovering):', err?.message || err);
    });

    global._postgresPool.on('connect', (client: any) => {
      // Attach an error listener directly to every client created in the pool so terminated connections never emit unhandled error
      client.on('error', (err: any) => {
        console.warn('[Postgres Client] Connection event error caught (recovering):', err?.message || err);
      });
    });
  }
  return global._postgresPool;
};

const pool = createPool();

export const db = drizzle(pool, { schema });

declare global {
  var _prodPostgresPool: Pool | undefined;
}

export const createProdPool = () => {
  return createPool();
};

export const prodPool = createProdPool();
export const prodDb = drizzle(prodPool, { schema });

export async function initDbConstraints() {
  const adminUser = process.env.SQL_ADMIN_USER || process.env.SQL_USER;
  const adminPassword = process.env.SQL_ADMIN_PASSWORD || process.env.SQL_PASSWORD;

  const targetDatabase =
    process.env.FORCE_DEV_DB === 'true'
      ? (process.env.SQL_DB_NAME || 'cloud_sql_development_database')
      : 'cloud_sql_production_database';

  const adminPool = new Pool({
    host: process.env.SQL_HOST,
    user: adminUser,
    password: adminPassword,
    database: targetDatabase,
    max: 1,
    connectionTimeoutMillis: 10000,
  });

  adminPool.on('error', (err: any) => {
    console.warn('[Postgres adminPool] Connection event caught:', err?.message || err);
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

      // Permitir resolução por Cancelamento em route_stops
      await client.query(`ALTER TABLE "route_stops" DROP CONSTRAINT IF EXISTS "route_stops_resolution_type_check"`);
      await client.query(`ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_resolution_type_check" CHECK (
        resolution_type IS NULL OR resolution_type IN ('RETURN_TO_ORIGIN', 'DELIVERED_LATER', 'DELIVERED_TO_ALTERNATIVE_LOCATION', 'CUSTOMER_PICKUP', 'DISCARDED', 'CANCELLATION', 'OTHER')
      )`);
      await client.query(`ALTER TABLE "route_stops" ADD COLUMN IF NOT EXISTS "compensation_amount" numeric(10,2)`);

      // M4.4 Versionamento e Edição Controlada
      await client.query(`ALTER TABLE "routes" ADD COLUMN IF NOT EXISTS "route_version" integer DEFAULT 1 NOT NULL`);
      await client.query(`ALTER TABLE "routes" ADD COLUMN IF NOT EXISTS "driver_acknowledged_version" integer DEFAULT 1 NOT NULL`);
      await client.query(`ALTER TABLE "routes" ADD COLUMN IF NOT EXISTS "change_pending_driver_approval" boolean DEFAULT false NOT NULL`);
      await client.query(`ALTER TABLE "routes" ADD COLUMN IF NOT EXISTS "pending_material_change" text`);

      // Agendamento de corridas (tabela própria, separada de routes)
      await client.query(`CREATE TABLE IF NOT EXISTS "route_schedules" (
        "route_id" integer PRIMARY KEY REFERENCES "routes"("id") ON DELETE CASCADE,
        "scheduled_for" timestamptz,
        "publish_at" timestamptz,
        "publish_error" text,
        "published_at" timestamptz,
        "updated_at" timestamptz DEFAULT now() NOT NULL
      )`);
      // O app usa SQL_USER; se for outro usuário além do admin, garante acesso à tabela nova
      const appUser = String(process.env.SQL_USER || '');
      if (appUser && appUser !== adminUser && /^[A-Za-z0-9_.@-]+$/.test(appUser)) {
        await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON "route_schedules" TO "${appUser}"`).catch(() => {});
      }

      // M4.4B Versionamento de Dispatches de Ofertas
      await client.query(`ALTER TABLE "route_offer_dispatches" ADD COLUMN IF NOT EXISTS "route_version" integer DEFAULT 1 NOT NULL`);

      // Drivers Lifecycle: Exclusion, Reactivation, Reinclusion & Historical Memory
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
          "destination_city" text DEFAULT 'Uberlândia' NOT NULL,
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

      console.log('[initDbConstraints] Successfully updated routes constraints, M4.4 schema and Takeat tables using admin pool.');
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error('[initDbConstraints] Error updating constraints with admin pool:', err.message);
  } finally {
    await adminPool.end().catch(() => {});
  }
}

