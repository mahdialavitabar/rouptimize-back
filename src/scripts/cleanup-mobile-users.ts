import * as dotenv from 'dotenv';
import { inArray, isNotNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as path from 'path';
import { Pool } from 'pg';
import * as schema from '../db/schema';

const workspaceRoot = path.resolve(__dirname, '../../../..');
const isSystemEnv = !!process.env.DB_HOST;

// Load environment-specific config
if (!process.env.NODE_ENV || process.env.NODE_ENV === 'development') {
  dotenv.config({
    path: path.join(workspaceRoot, '.env.development'),
    override: !isSystemEnv,
  });
} else {
  dotenv.config({
    path: path.join(workspaceRoot, '.env'),
    override: !isSystemEnv,
  });
}

async function main() {
  console.log('Starting mobile_user cleanup...');

  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'rouptimize_db',
  });

  const db = drizzle(pool, { schema });

  try {
    // 1. Get all mobile users with a driverId
    const mobileUsersWithDriver = await db.query.mobileUsers.findMany({
      where: isNotNull(schema.mobileUsers.driverId),
      columns: {
        id: true,
        driverId: true,
        username: true,
      },
    });

    if (mobileUsersWithDriver.length === 0) {
      console.log('No mobile users with driverId found.');
      return;
    }

    console.log(
      `Found ${mobileUsersWithDriver.length} mobile users with driverId.`,
    );

    // 2. Get all valid driver IDs
    const driverIds = mobileUsersWithDriver
      .map((mu) => mu.driverId!)
      .filter(Boolean);

    // Fetch existing drivers
    // We chunk this if there are too many, but for now assuming reasonable size
    const existingDrivers = await db.query.drivers.findMany({
      where: inArray(schema.drivers.id, driverIds),
      columns: {
        id: true,
      },
    });

    const existingDriverIds = new Set(existingDrivers.map((d) => d.id));

    // 3. Identify orphans
    const orphans = mobileUsersWithDriver.filter(
      (mu) => !existingDriverIds.has(mu.driverId!),
    );

    if (orphans.length === 0) {
      console.log('No orphaned mobile_user records found. Database is clean.');
    } else {
      console.log(`Found ${orphans.length} orphaned mobile_user records.`);

      const orphanIds = orphans.map((o) => o.id);

      // 4. Fix orphans
      await db
        .update(schema.mobileUsers)
        .set({ driverId: null })
        .where(inArray(schema.mobileUsers.id, orphanIds));

      console.log(
        `Successfully set driverId = NULL for ${orphans.length} records.`,
      );
      orphans.forEach((o) =>
        console.log(`  - Fixed MobileUser: ${o.username} (ID: ${o.id})`),
      );
    }
  } catch (error) {
    console.error('Error during cleanup:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
