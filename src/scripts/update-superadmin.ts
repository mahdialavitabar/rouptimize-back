import * as bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';
import { eq } from 'drizzle-orm';
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
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });

  const db = drizzle(pool, { schema });

  const username = process.env.SUPER_ADMIN_USERNAME || 'superadmin';
  const password = process.env.SUPER_ADMIN_PASSWORD || 'superadminpassword';

  console.log(`Updating password for user: ${username}`);
  console.log(`Using password: ${password}`);

  const hashedPassword = await bcrypt.hash(password, 10);

  await db
    .update(schema.users)
    .set({ password: hashedPassword })
    .where(eq(schema.users.username, username));

  console.log('Password updated successfully.');
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
