import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

/**
 * Drizzle-клієнт поверх Neon HTTP (serverless-friendly).
 * DATABASE_URL задається в .env.local / Vercel env.
 */
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  // Не кидаємо на імпорті, щоб білд без БД (напр. чисті движки) не падав.
  console.warn('[db] DATABASE_URL не задано — запити до бази недоступні.');
}

export const sql = connectionString ? neon(connectionString) : null;
export const db = sql ? drizzle(sql, { schema }) : null;
export { schema };
