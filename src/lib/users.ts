import type Database from 'better-sqlite3';
import type { User, SafeUser } from '@/types/user';

export function toSafeUser(user: User): SafeUser {
  return { id: user.id, email: user.email, created_at: user.created_at };
}

export function createUser(
  db: Database.Database,
  email: string,
  passwordHash: string
): User {
  const stmt = db.prepare(
    'INSERT INTO users (email, password_hash) VALUES (?, ?)'
  );
  const result = stmt.run(email, passwordHash);
  return findUserById(db, Number(result.lastInsertRowid))!;
}

export function findUserByEmail(
  db: Database.Database,
  email: string
): User | null {
  const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
  return (stmt.get(email) as User) ?? null;
}

export function findUserById(
  db: Database.Database,
  id: number
): User | null {
  const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
  return (stmt.get(id) as User) ?? null;
}
