import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set (see .env.example)');

// Migrations run on Neon's direct (non-pooled) endpoint; the app uses the pooled one.
const directUrl = url.replace('-pooler.', '.');

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: directUrl },
  strict: true,
  verbose: true,
});
