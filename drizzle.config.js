import 'dotenv/config';

/** @type { import("drizzle-kit").Config } */
export default {
  schema: './src/db/schema.js',
  out: './drizzle',
  driver: 'pg', // 
  dbCredentials: {
    connectionString: process.env.DATABASE_URL,
  },
};