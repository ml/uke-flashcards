import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from './helpers';
import { createUser, findUserByEmail, findUserById } from '@/lib/users';

let db: Database.Database;

beforeEach(() => {
  db = createTestDb();
});

describe('createUser', () => {
  it('inserts and returns user', () => {
    const user = createUser(db, 'test@example.com', 'hashed_password');
    expect(user.id).toBe(1);
    expect(user.email).toBe('test@example.com');
    expect(user.password_hash).toBe('hashed_password');
    expect(user.created_at).toBeTruthy();
  });

  it('throws on duplicate email', () => {
    createUser(db, 'dup@example.com', 'hash1');
    expect(() => createUser(db, 'dup@example.com', 'hash2')).toThrow();
  });
});

describe('findUserByEmail', () => {
  it('returns user when found', () => {
    createUser(db, 'find@example.com', 'hash');
    const user = findUserByEmail(db, 'find@example.com');
    expect(user).not.toBeNull();
    expect(user!.email).toBe('find@example.com');
  });

  it('returns null for missing email', () => {
    const user = findUserByEmail(db, 'nonexistent@example.com');
    expect(user).toBeNull();
  });
});

describe('findUserById', () => {
  it('returns user when found', () => {
    const created = createUser(db, 'byid@example.com', 'hash');
    const user = findUserById(db, created.id);
    expect(user).not.toBeNull();
    expect(user!.id).toBe(created.id);
    expect(user!.email).toBe('byid@example.com');
  });

  it('returns null for missing id', () => {
    const user = findUserById(db, 9999);
    expect(user).toBeNull();
  });
});
