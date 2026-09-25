import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();

async function migrate() {
  console.log('Migrating schema for M1.1 with admin connection...');

  const pool = new Pool({
    host: process.env.SQL_HOST,
    user: process.env.SQL_ADMIN_USER || process.env.SQL_USER,
    password: process.env.SQL_ADMIN_PASSWORD || process.env.SQL_PASSWORD,
    database: process.env.SQL_DB_NAME,
  });

  const client = await pool.connect();
  try {
    await client.query(`
      ALTER TABLE drivers ADD COLUMN IF NOT EXISTS pix_key_type text DEFAULT 'REQUIRES_UPDATE' NOT NULL;
    `);

    await client.query(`
      ALTER TABLE drivers ADD COLUMN IF NOT EXISTS pix_key_value text;
    `);

    await client.query(`
      ALTER TABLE drivers ALTER COLUMN pix_key DROP NOT NULL;
    `);

    // Migrate legacy data explicitly:
    await client.query(`
      UPDATE drivers 
      SET pix_key_value = pix_key,
          pix_key_type = 'REQUIRES_UPDATE'
      WHERE pix_key_value IS NULL;
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'drivers_pix_key_type_check') THEN
          ALTER TABLE drivers ADD CONSTRAINT drivers_pix_key_type_check CHECK (pix_key_type IN ('CPF', 'PHONE', 'EMAIL', 'RANDOM', 'REQUIRES_UPDATE'));
        END IF;
      END $$;
    `);

    await client.query(`
      ALTER TABLE driver_events ADD COLUMN IF NOT EXISTS actor_type text;
      ALTER TABLE driver_events ADD COLUMN IF NOT EXISTS actor_id text;
      ALTER TABLE driver_events ADD COLUMN IF NOT EXISTS field_changed text;
      ALTER TABLE driver_events ADD COLUMN IF NOT EXISTS old_value text;
      ALTER TABLE driver_events ADD COLUMN IF NOT EXISTS new_value text;
      ALTER TABLE driver_events ADD COLUMN IF NOT EXISTS details text;
    `);

    console.log('M1.1 schema migration completed successfully.');
  } finally {
    client.release();
    await pool.end();
  }
  process.exit(0);
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
