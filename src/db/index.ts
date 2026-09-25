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
      console.log('[initDbConstraints] Successfully updated routes constraints for M4 using admin pool.');
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error('[initDbConstraints] Error updating constraints with admin pool:', err.message);
  } finally {
    await adminPool.end().catch(() => {});
  }
}

