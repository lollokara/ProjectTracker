import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index';

// Export a factory or just the db instance that will be initialized on first access or after a manual call if needed
// But since we want to keep the same API for other apps:
let dbInstance: any;

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
export const db = new Proxy({} as any, {
  get(_, prop) {
    return getDb()[prop];
  }
});

// Re-export schema for convenience
export * from './schema/index';
export type Database = ReturnType<typeof getDb>;
