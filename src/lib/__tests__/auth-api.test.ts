import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from './helpers';
import { _setDbForTest } from '@/lib/db';
import { createToken, hashPassword, TOKEN_COOKIE_NAME } from '@/lib/auth';
import { createUser } from '@/lib/users';

// Import route handlers
import { POST as registerHandler } from '@/app/api/auth/register/route';
import { POST as loginHandler } from '@/app/api/auth/login/route';
import { POST as logoutHandler } from '@/app/api/auth/logout/route';
import { GET as meHandler } from '@/app/api/auth/me/route';

let db: Database.Database;

function makeRequest(
  url: string,
  options: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
    cookies?: Record<string, string>;
  } = {}
) {
  const { method = 'GET', body, headers = {}, cookies = {} } = options;
  const reqHeaders = new Headers(headers);
  if (body) {
    reqHeaders.set('content-type', 'application/json');
  }

  // Build cookie header
  const cookieStr = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
  if (cookieStr) {
    reqHeaders.set('cookie', cookieStr);
  }

  const { NextRequest } = require('next/server');
  return new NextRequest(new URL(url, 'http://localhost:3000'), {
    method,
    headers: reqHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  db = createTestDb();
  _setDbForTest(db);
});

afterEach(() => {
  _setDbForTest(null);
});

describe('POST /api/auth/register', () => {
  it('valid register returns 201 + user data', async () => {
    const req = makeRequest('/api/auth/register', {
      method: 'POST',
      body: { email: 'new@example.com', password: 'password123' },
    });
    const res = await registerHandler(req);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.user.email).toBe('new@example.com');
    expect(data.user.id).toBeTruthy();
    expect(data.user.password_hash).toBeUndefined();
  });

  it('register sets auth cookie in response', async () => {
    const req = makeRequest('/api/auth/register', {
      method: 'POST',
      body: { email: 'cookie@example.com', password: 'password123' },
    });
    const res = await registerHandler(req);
    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toContain(TOKEN_COOKIE_NAME);
  });

  it('missing email returns 400', async () => {
    const req = makeRequest('/api/auth/register', {
      method: 'POST',
      body: { password: 'password123' },
    });
    const res = await registerHandler(req);
    expect(res.status).toBe(400);
  });

  it('missing password returns 400', async () => {
    const req = makeRequest('/api/auth/register', {
      method: 'POST',
      body: { email: 'test@example.com' },
    });
    const res = await registerHandler(req);
    expect(res.status).toBe(400);
  });

  it('invalid email format returns 400', async () => {
    const req = makeRequest('/api/auth/register', {
      method: 'POST',
      body: { email: 'notanemail', password: 'password123' },
    });
    const res = await registerHandler(req);
    expect(res.status).toBe(400);
  });

  it('short password (<8 chars) returns 400', async () => {
    const req = makeRequest('/api/auth/register', {
      method: 'POST',
      body: { email: 'test@example.com', password: 'short' },
    });
    const res = await registerHandler(req);
    expect(res.status).toBe(400);
  });

  it('duplicate email returns 409', async () => {
    const hash = await hashPassword('password123');
    createUser(db, 'dup@example.com', hash);
    const req = makeRequest('/api/auth/register', {
      method: 'POST',
      body: { email: 'dup@example.com', password: 'password123' },
    });
    const res = await registerHandler(req);
    expect(res.status).toBe(409);
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    const hash = await hashPassword('correctpassword');
    createUser(db, 'login@example.com', hash);
  });

  it('valid login returns 200 + user data', async () => {
    const req = makeRequest('/api/auth/login', {
      method: 'POST',
      body: { email: 'login@example.com', password: 'correctpassword' },
    });
    const res = await loginHandler(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.user.email).toBe('login@example.com');
  });

  it('login sets auth cookie in response', async () => {
    const req = makeRequest('/api/auth/login', {
      method: 'POST',
      body: { email: 'login@example.com', password: 'correctpassword' },
    });
    const res = await loginHandler(req);
    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toContain(TOKEN_COOKIE_NAME);
  });

  it('wrong email returns 401', async () => {
    const req = makeRequest('/api/auth/login', {
      method: 'POST',
      body: { email: 'wrong@example.com', password: 'correctpassword' },
    });
    const res = await loginHandler(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('Invalid credentials');
  });

  it('wrong password returns 401', async () => {
    const req = makeRequest('/api/auth/login', {
      method: 'POST',
      body: { email: 'login@example.com', password: 'wrongpassword' },
    });
    const res = await loginHandler(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('Invalid credentials');
  });

  it('missing fields returns 400', async () => {
    const req = makeRequest('/api/auth/login', {
      method: 'POST',
      body: {},
    });
    const res = await loginHandler(req);
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/logout', () => {
  it('logout clears cookie (maxAge=0)', async () => {
    const res = await logoutHandler();
    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toContain(TOKEN_COOKIE_NAME);
    expect(setCookie).toContain('Max-Age=0');
  });

  it('logout returns { success: true }', async () => {
    const res = await logoutHandler();
    const data = await res.json();
    expect(data).toEqual({ success: true });
  });
});

describe('GET /api/auth/me', () => {
  it('with valid x-user-id header returns user data', async () => {
    const hash = await hashPassword('pass');
    const user = createUser(db, 'me@example.com', hash);
    const req = makeRequest('/api/auth/me', {
      headers: { 'x-user-id': String(user.id) },
    });
    const res = await meHandler(req);
    const data = await res.json();
    expect(data.user).not.toBeNull();
    expect(data.user.email).toBe('me@example.com');
  });

  it('without header returns { user: null }', async () => {
    const req = makeRequest('/api/auth/me');
    const res = await meHandler(req);
    const data = await res.json();
    expect(data.user).toBeNull();
  });

  it('non-existent user ID returns { user: null }', async () => {
    const req = makeRequest('/api/auth/me', {
      headers: { 'x-user-id': '9999' },
    });
    const res = await meHandler(req);
    const data = await res.json();
    expect(data.user).toBeNull();
  });
});

describe('Middleware security', () => {
  it('middleware strips incoming x-user-id header', async () => {
    const { middleware } = await import('@/middleware');
    const req = makeRequest('/api/auth/me', {
      headers: { 'x-user-id': '999', 'x-user-email': 'spoofed@evil.com' },
    });
    const res = await middleware(req);
    // Without a valid cookie, headers should be stripped (not present)
    const modifiedHeaders = res.headers.get('x-middleware-request-x-user-id');
    // Next.js middleware passes modified headers as x-middleware-request-* headers
    // When no valid cookie, the header should not be set
    expect(modifiedHeaders).toBeFalsy();
  });

  it('middleware sets x-user-id from valid JWT cookie', async () => {
    const { middleware } = await import('@/middleware');
    const token = await createToken({ userId: 42, email: 'test@example.com' });
    const req = makeRequest('/api/something', {
      cookies: { [TOKEN_COOKIE_NAME]: token },
    });
    const res = await middleware(req);
    // Next.js middleware communicates header changes via x-middleware-request-* headers
    const userId = res.headers.get('x-middleware-request-x-user-id');
    expect(userId).toBe('42');
  });
});
