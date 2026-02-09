import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { defineConfig, env } from 'prisma/config';

loadEnv({ path: path.resolve(__dirname, '.env') });

function buildDatabaseUrlFromEnv() {
  const user = process.env.POSTGRES_USER;
  const password = process.env.POSTGRES_PASSWORD;
  const host = process.env.POSTGRES_HOST ?? 'postgres';
  const port = process.env.POSTGRES_PORT ?? '5432';
  const db = process.env.POSTGRES_DB;
  const schema = process.env.POSTGRES_SCHEMA ?? 'public';

  if (!user || !password || !db) return null;

  const encodedUser = encodeURIComponent(user);
  const encodedPassword = encodeURIComponent(password);
  const encodedDb = encodeURIComponent(db);
  const encodedSchema = encodeURIComponent(schema);

  return `postgresql://${encodedUser}:${encodedPassword}@${host}:${port}/${encodedDb}?schema=${encodedSchema}`;
}

function resolveDatabaseUrl() {
  const directUrl = process.env.DATABASE_URL;
  if (directUrl && directUrl.trim().length > 0) return directUrl;

  const fallbackUrl = buildDatabaseUrlFromEnv();
  if (fallbackUrl) return fallbackUrl;

  throw new Error(
    'DATABASE_URL is required. Set DATABASE_URL or POSTGRES_USER/POSTGRES_PASSWORD/POSTGRES_DB.',
  );
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: resolveDatabaseUrl(),
  },
});
