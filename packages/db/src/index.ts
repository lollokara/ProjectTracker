import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index';

let dbInstance: PostgresJsDatabase<typeof schema> | null = null;

export const getDb = () => {
  if (!dbInstance) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('[db] DATABASE_URL NOT FOUND in process.env');
    }
    const queryClient = postgres(connectionString);
    dbInstance = drizzle(queryClient, { schema });
  }
  return dbInstance;
};

// Proxied db object to maintain existing API
export const db = new Proxy({} as any as PostgresJsDatabase<typeof schema>, {
  get(_, prop) {
    return (getDb() as any)[prop];
  }
});

// Re-export schema for convenience
export * from './schema/index';
export type Database = PostgresJsDatabase<typeof schema>;
