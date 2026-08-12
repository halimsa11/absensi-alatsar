import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL tidak ditemukan di file .env!');
}

// Inisialisasi koneksi postgres dengan SSL mode dari .env
const client = postgres(process.env.DATABASE_URL);

export const db = drizzle(client, { schema });