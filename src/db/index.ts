import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';
import * as schema from './schema.ts';

declare global {
  var _postgresPool: Pool | undefined;
}

export const createPool = () => {
  if (!global._postgresPool) {
    global._postgresPool = new Pool({
      host: process.env.SQL_HOST,
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      database: process.env.SQL_DB_NAME,
      max: 10,
      connectionTimeoutMillis: 15000,
    });

    global._postgresPool.on('error', (err) => {
      console.error('Unexpected error on idle SQL pool client:', err);
    });
  }
  return global._postgresPool;
};

const pool = createPool();

export const db = drizzle(pool, { schema });

export async function initDbConstraints() {
  const adminUser = process.env.SQL_ADMIN_USER || process.env.SQL_USER;
  const adminPassword = process.env.SQL_ADMIN_PASSWORD || process.env.SQL_PASSWORD;

  const adminPool = new Pool({
    host: process.env.SQL_HOST,
    user: adminUser,
    password: adminPassword,
    database: process.env.SQL_DB_NAME,
    max: 1,
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

      // M4.4 Versionamento e Edição Controlada
      await client.query(`ALTER TABLE "routes" ADD COLUMN IF NOT EXISTS "route_version" integer DEFAULT 1 NOT NULL`);
      await client.query(`ALTER TABLE "routes" ADD COLUMN IF NOT EXISTS "driver_acknowledged_version" integer DEFAULT 1 NOT NULL`);
      await client.query(`ALTER TABLE "routes" ADD COLUMN IF NOT EXISTS "change_pending_driver_approval" boolean DEFAULT false NOT NULL`);
      await client.query(`ALTER TABLE "routes" ADD COLUMN IF NOT EXISTS "pending_material_change" text`);

      // M4.4B Versionamento de Dispatches de Ofertas
      await client.query(`ALTER TABLE "route_offer_dispatches" ADD COLUMN IF NOT EXISTS "route_version" integer DEFAULT 1 NOT NULL`);

      // Drivers Lifecycle: Exclusion, Reactivation, Reinclusion & Historical Memory
      await client.query(`ALTER TABLE "drivers" DROP CONSTRAINT IF EXISTS "drivers_status_check"`);
      await client.query(`ALTER TABLE "drivers" ADD CONSTRAINT "drivers_status_check" CHECK (status IN ('PENDING', 'ACTIVE', 'BLOCKED', 'EXCLUDED'))`);
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

      console.log('[initDbConstraints] Successfully updated routes constraints and M4.4 schema using admin pool.');
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error('[initDbConstraints] Error updating constraints with admin pool:', err.message);
  } finally {
    await adminPool.end().catch(() => {});
  }
}

