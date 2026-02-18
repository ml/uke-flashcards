import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'uke-flashcards.db');

let db: Database.Database | null = null;

/**
 * Get or create the database connection.
 * Creates the database file and schema if they don't exist.
 */
export function getDb(): Database.Database {
  if (db) {
    return db;
  }

  db = new Database(DB_PATH);

  // Enable WAL mode for better performance
  db.pragma('journal_mode = WAL');

  // Create tables if they don't exist
  initSchema(db);

  return db;
}

/**
 * Initialize the database schema.
 */
export function initSchema(database: Database.Database): void {
  // Users table
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Sessions table - tracks study sessions
  database.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    )
  `);

  // Attempts table - tracks individual question attempts
  database.exec(`
    CREATE TABLE IF NOT EXISTS attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id TEXT NOT NULL,
      session_id INTEGER,
      selected_answer TEXT NOT NULL,
      is_correct INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    )
  `);

  // Migrate: add user_id columns if they don't exist
  const sessionsColumns = (
    database.pragma('table_info(sessions)') as { name: string }[]
  ).map((col) => col.name);
  if (!sessionsColumns.includes('user_id')) {
    database.exec(
      `ALTER TABLE sessions ADD COLUMN user_id INTEGER REFERENCES users(id)`
    );
  }

  const attemptsColumns = (
    database.pragma('table_info(attempts)') as { name: string }[]
  ).map((col) => col.name);
  if (!attemptsColumns.includes('user_id')) {
    database.exec(
      `ALTER TABLE attempts ADD COLUMN user_id INTEGER REFERENCES users(id)`
    );
  }

  // Create indexes for common queries
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_attempts_question_id ON attempts(question_id);
    CREATE INDEX IF NOT EXISTS idx_attempts_session_id ON attempts(session_id);
    CREATE INDEX IF NOT EXISTS idx_attempts_created_at ON attempts(created_at);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_attempts_user_id ON attempts(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
  `);
}

/**
 * Override the database instance (for testing only).
 */
export function _setDbForTest(testDb: Database.Database | null): void {
  db = testDb;
}

/**
 * Close the database connection.
 * Call this when shutting down the application.
 */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
