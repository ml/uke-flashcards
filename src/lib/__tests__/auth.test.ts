import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  createToken,
  verifyToken,
} from '@/lib/auth';
import { SignJWT } from 'jose';

describe('hashPassword', () => {
  it('returns a string different from the original', async () => {
    const hash = await hashPassword('mypassword');
    expect(typeof hash).toBe('string');
    expect(hash).not.toBe('mypassword');
  });

  it('produces different hashes for same password (salt verification)', async () => {
    const hash1 = await hashPassword('mypassword');
    const hash2 = await hashPassword('mypassword');
    expect(hash1).not.toBe(hash2);
  });
});

describe('verifyPassword', () => {
  it('returns true for correct password', async () => {
    const hash = await hashPassword('correct-password');
    const result = await verifyPassword('correct-password', hash);
    expect(result).toBe(true);
  });

  it('returns false for wrong password', async () => {
    const hash = await hashPassword('correct-password');
    const result = await verifyPassword('wrong-password', hash);
    expect(result).toBe(false);
  });
});

describe('createToken', () => {
  it('returns a non-empty string', async () => {
    const token = await createToken({ userId: 1, email: 'test@example.com' });
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
  });
});

describe('verifyToken', () => {
  it('decodes token from createToken correctly', async () => {
    const payload = { userId: 42, email: 'user@example.com' };
    const token = await createToken(payload);
    const decoded = await verifyToken(token);
    expect(decoded).toEqual(payload);
  });

  it('returns null for invalid token', async () => {
    const result = await verifyToken('not-a-valid-token');
    expect(result).toBeNull();
  });

  it('returns null for expired token', async () => {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
    const token = await new SignJWT({ userId: 1, email: 'a@b.com' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 1800)
      .sign(secret);
    const result = await verifyToken(token);
    expect(result).toBeNull();
  });

  it('returns null for wrong-secret token', async () => {
    const wrongSecret = new TextEncoder().encode('wrong-secret');
    const token = await new SignJWT({ userId: 1, email: 'a@b.com' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(wrongSecret);
    const result = await verifyToken(token);
    expect(result).toBeNull();
  });

  it('round-trips payload correctly (userId + email)', async () => {
    const payload = { userId: 99, email: 'roundtrip@test.com' };
    const token = await createToken(payload);
    const decoded = await verifyToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded!.userId).toBe(99);
    expect(decoded!.email).toBe('roundtrip@test.com');
  });
});
