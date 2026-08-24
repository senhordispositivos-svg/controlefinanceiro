import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, PoolConfig } from 'pg';
import * as schema from './schema';
import * as dotenv from 'dotenv';

dotenv.config();

declare global {
  var _postgresPool: Pool | undefined;
}

export const createPool = () => {
  if (!global._postgresPool) {
    const connectionString =
      process.env.DATABASE_URL ||
      process.env.POSTGRES_URL ||
      (process.env.PGHOST && process.env.PGUSER
        ? `postgresql://${encodeURIComponent(process.env.PGUSER)}:${encodeURIComponent(
            process.env.PGPASSWORD || ''
          )}@${process.env.PGHOST}:${process.env.PGPORT || 5432}/${process.env.PGDATABASE || 'postgres'}`
        : undefined);

    let config: PoolConfig;

    if (connectionString) {
      config = {
        connectionString,
        ssl: connectionString.includes('supabase.co') ? { rejectUnauthorized: false } : undefined,
        max: 10,
        connectionTimeoutMillis: 15000,
      };
    } else {
      config = {
        host: process.env.SQL_HOST || process.env.PGHOST || 'db.dpaylubvupjjokpukuxy.supabase.co',
        user: process.env.SQL_USER || process.env.PGUSER || 'postgres',
        password: process.env.SQL_PASSWORD || process.env.PGPASSWORD || 'Ojf6994@#gestaoPessoas',
        database: process.env.SQL_DB_NAME || process.env.PGDATABASE || 'postgres',
        port: Number(process.env.SQL_PORT || process.env.PGPORT || 5432),
        ssl: { rejectUnauthorized: false },
        max: 10,
        connectionTimeoutMillis: 15000,
      };
    }

    global._postgresPool = new Pool(config);

    global._postgresPool.on('error', (err) => {
      console.error('Unexpected error on idle PostgreSQL pool client:', err);
    });
  }
  return global._postgresPool;
};

const pool = createPool();

export const db = drizzle(pool, { schema });
export { pool };
