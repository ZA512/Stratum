export function resolveDatabaseUrlFromEnv(): string {
  const directUrl = process.env.DATABASE_URL;
  if (directUrl && directUrl.trim().length > 0) return directUrl;

  const user = process.env.POSTGRES_USER;
  const password = process.env.POSTGRES_PASSWORD;
  const host = process.env.POSTGRES_HOST ?? 'postgres';
  const port = process.env.POSTGRES_PORT ?? '5432';
  const db = process.env.POSTGRES_DB;
  const schema = process.env.POSTGRES_SCHEMA ?? 'public';

  if (!user || !password || !db) {
    throw new Error(
      'DATABASE_URL is required. Set DATABASE_URL or POSTGRES_USER/POSTGRES_PASSWORD/POSTGRES_DB.',
    );
  }

  const encodedUser = encodeURIComponent(user);
  const encodedPassword = encodeURIComponent(password);
  const encodedDb = encodeURIComponent(db);
  const encodedSchema = encodeURIComponent(schema);

  return `postgresql://${encodedUser}:${encodedPassword}@${host}:${port}/${encodedDb}?schema=${encodedSchema}`;
}

export function ensureDatabaseUrlEnv(): string {
  const url = resolveDatabaseUrlFromEnv();
  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim().length === 0) {
    process.env.DATABASE_URL = url;
  }
  return url;
}
