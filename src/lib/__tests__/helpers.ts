import Database from 'better-sqlite3';
import { initSchema } from '@/lib/db';

/**
 * Create an in-memory SQLite database with full schema for testing.
 * Each test file should call this to get an isolated DB instance.
 */
export function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  initSchema(db);
  return db;
}
