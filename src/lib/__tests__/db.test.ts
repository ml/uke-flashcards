import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { initSchema } from '@/lib/db';

let db: Database.Database;

beforeEach(() => {
  db = new Database(':memory:');
  initSchema(db);
});

describe('initSchema', () => {
  it('creates users table with correct columns', () => {
    const columns = db.pragma('table_info(users)') as {
      name: string;
      type: string;
      notnull: number;
    }[];
    const colNames = columns.map((c) => c.name);
    expect(colNames).toContain('id');
    expect(colNames).toContain('email');
    expect(colNames).toContain('password_hash');
    expect(colNames).toContain('created_at');
  });

  it('sessions table has user_id column (nullable)', () => {
    const columns = db.pragma('table_info(sessions)') as {
      name: string;
      notnull: number;
    }[];
    const userIdCol = columns.find((c) => c.name === 'user_id');
    expect(userIdCol).toBeDefined();
    expect(userIdCol!.notnull).toBe(0);
  });

  it('attempts table has user_id column (nullable)', () => {
    const columns = db.pragma('table_info(attempts)') as {
      name: string;
      notnull: number;
    }[];
    const userIdCol = columns.find((c) => c.name === 'user_id');
    expect(userIdCol).toBeDefined();
    expect(userIdCol!.notnull).toBe(0);
  });

  it('users.email has UNIQUE constraint', () => {
    db.prepare(
      "INSERT INTO users (email, password_hash) VALUES ('a@b.com', 'hash1')"
    ).run();
    expect(() =>
      db
        .prepare(
          "INSERT INTO users (email, password_hash) VALUES ('a@b.com', 'hash2')"
        )
        .run()
    ).toThrow();
  });

  it('idx_users_email index exists', () => {
    const indexes = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='users'"
      )
      .all() as { name: string }[];
    expect(indexes.map((i) => i.name)).toContain('idx_users_email');
  });

  it('idx_attempts_user_id index exists', () => {
    const indexes = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='attempts'"
      )
      .all() as { name: string }[];
    expect(indexes.map((i) => i.name)).toContain('idx_attempts_user_id');
  });

  it('idx_sessions_user_id index exists', () => {
    const indexes = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='sessions'"
      )
      .all() as { name: string }[];
    expect(indexes.map((i) => i.name)).toContain('idx_sessions_user_id');
  });

  it('existing records without user_id still work (backward compat)', () => {
    db.prepare('INSERT INTO sessions (id) VALUES (NULL)').run();
    db.prepare(
      "INSERT INTO attempts (question_id, selected_answer, is_correct) VALUES ('Q1', 'A', 1)"
    ).run();
    const session = db.prepare('SELECT * FROM sessions').get() as {
      user_id: number | null;
    };
    const attempt = db.prepare('SELECT * FROM attempts').get() as {
      user_id: number | null;
    };
    expect(session.user_id).toBeNull();
    expect(attempt.user_id).toBeNull();
  });
});
