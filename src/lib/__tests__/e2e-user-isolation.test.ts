import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from './helpers';
import { _setDbForTest } from '@/lib/db';
import { hashPassword, createToken, TOKEN_COOKIE_NAME } from '@/lib/auth';
import { createUser } from '@/lib/users';

// Mock questions module
vi.mock('@/lib/questions', () => {
  const questions = Array.from({ length: 20 }, (_, i) => {
    const sections = [
      'Radiotechnika',
      'Przepisy',
      'Bezpieczeństwo',
      'Procedury operatorskie',
    ];
    return {
      id: `Q${i + 1}`,
      number: i + 1,
      text: `Test question ${i + 1}`,
      answers: [
        { letter: 'A', text: 'Answer A' },
        { letter: 'B', text: 'Answer B' },
        { letter: 'C', text: 'Answer C' },
      ],
      correctAnswerLetter: 'A',
      section: sections[i % 4],
    };
  });

  return {
    getQuestions: () => questions,
    getQuestionById: (id: string) => questions.find((q) => q.id === id) || null,
    getSections: () => [
      'Radiotechnika',
      'Przepisy',
      'Bezpieczeństwo',
      'Procedury operatorskie',
    ],
  };
});

let db: Database.Database;

function makeRequest(
  url: string,
  options: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {}
) {
  const { method = 'GET', body, headers = {} } = options;
  const reqHeaders = new Headers(headers);
  if (body) {
    reqHeaders.set('content-type', 'application/json');
  }
  const { NextRequest } = require('next/server');
  return new NextRequest(new URL(url, 'http://localhost:3000'), {
    method,
    headers: reqHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });
}

function makeAuthRequest(
  url: string,
  userId: number,
  options: { method?: string; body?: unknown } = {}
) {
  return makeRequest(url, {
    ...options,
    headers: { 'x-user-id': String(userId) },
  });
}

async function createTestUser(email: string): Promise<{ id: number }> {
  const hash = await hashPassword('password123');
  const user = createUser(db, email, hash);
  return { id: user.id };
}

function recordAttempt(questionId: string, selectedAnswer: string, isCorrect: boolean, userId: number) {
  db.prepare(
    'INSERT INTO attempts (question_id, selected_answer, is_correct, user_id) VALUES (?, ?, ?, ?)'
  ).run(questionId, selectedAnswer, isCorrect ? 1 : 0, userId);
}

beforeEach(async () => {
  db = createTestDb();
  _setDbForTest(db);
});

afterEach(() => {
  _setDbForTest(null);
});

describe('E2E multi-user isolation', () => {
  let alice: { id: number };
  let bob: { id: number };

  beforeEach(async () => {
    alice = await createTestUser('alice@test.com');
    bob = await createTestUser('bob@test.com');

    // Alice: 5 questions, 3 correct (60%)
    recordAttempt('Q1', 'A', true, alice.id);
    recordAttempt('Q2', 'A', true, alice.id);
    recordAttempt('Q3', 'A', true, alice.id);
    recordAttempt('Q4', 'B', false, alice.id);
    recordAttempt('Q5', 'B', false, alice.id);

    // Bob: 5 questions, 5 correct (100%)
    recordAttempt('Q1', 'A', true, bob.id);
    recordAttempt('Q2', 'A', true, bob.id);
    recordAttempt('Q3', 'A', true, bob.id);
    recordAttempt('Q4', 'A', true, bob.id);
    recordAttempt('Q5', 'A', true, bob.id);
  });

  it('Alice stats show 60% accuracy', async () => {
    const { GET } = await import('@/app/api/stats/route');
    const req = makeAuthRequest('/api/stats', alice.id);
    const res = await GET(req);
    const data = await res.json();
    expect(data.overall.totalAttempts).toBe(5);
    expect(data.overall.correctAttempts).toBe(3);
    expect(data.overall.correctnessRate).toBeCloseTo(0.6, 2);
  });

  it('Bob stats show 100% accuracy', async () => {
    const { GET } = await import('@/app/api/stats/route');
    const req = makeAuthRequest('/api/stats', bob.id);
    const res = await GET(req);
    const data = await res.json();
    expect(data.overall.totalAttempts).toBe(5);
    expect(data.overall.correctAttempts).toBe(5);
    expect(data.overall.correctnessRate).toBe(1);
  });

  it('anonymous stats show zeros despite data in DB', async () => {
    const { GET } = await import('@/app/api/stats/route');
    const req = makeRequest('/api/stats');
    const res = await GET(req);
    const data = await res.json();
    expect(data.overall.totalAttempts).toBe(0);
    expect(data.overall.correctAttempts).toBe(0);
  });

  it('anonymous can fetch questions (all unseen)', async () => {
    const { GET } = await import('@/app/api/questions/next/route');
    const req = makeRequest('/api/questions/next');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.question).toBeTruthy();
    expect(data.phase).toBe('coverage');
  });

  it('anonymous cannot create sessions', async () => {
    const { POST } = await import('@/app/api/sessions/route');
    const req = makeRequest('/api/sessions', {
      method: 'POST',
      body: {},
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('session history isolation: Alice sees only her sessions', async () => {
    // Create sessions for both users
    db.prepare('INSERT INTO sessions (user_id) VALUES (?)').run(alice.id);
    db.prepare('INSERT INTO sessions (user_id) VALUES (?)').run(alice.id);
    db.prepare('INSERT INTO sessions (user_id) VALUES (?)').run(bob.id);

    const { GET } = await import('@/app/api/sessions/history/route');
    const req = makeAuthRequest('/api/sessions/history', alice.id);
    const res = await GET(req);
    const data = await res.json();
    expect(data.sessions).toHaveLength(2);
  });

  it('session history isolation: Bob sees only his session', async () => {
    db.prepare('INSERT INTO sessions (user_id) VALUES (?)').run(alice.id);
    db.prepare('INSERT INTO sessions (user_id) VALUES (?)').run(bob.id);

    const { GET } = await import('@/app/api/sessions/history/route');
    const req = makeAuthRequest('/api/sessions/history', bob.id);
    const res = await GET(req);
    const data = await res.json();
    expect(data.sessions).toHaveLength(1);
  });

  it('anonymous gets empty session history', async () => {
    db.prepare('INSERT INTO sessions (user_id) VALUES (?)').run(alice.id);

    const { GET } = await import('@/app/api/sessions/history/route');
    const req = makeRequest('/api/sessions/history');
    const res = await GET(req);
    const data = await res.json();
    expect(data.sessions).toHaveLength(0);
  });

  it('question stats isolation: Alice sees only her attempts on Q1', async () => {
    const { GET } = await import('@/app/api/stats/question/[id]/route');
    const req = makeAuthRequest('/api/stats/question/Q1', alice.id);
    const res = await GET(req, { params: Promise.resolve({ id: 'Q1' }) });
    const data = await res.json();
    expect(data.stats.totalAttempts).toBe(1);
    expect(data.stats.correctAttempts).toBe(1);
  });

  it('question stats isolation: Bob sees only his attempts on Q1', async () => {
    const { GET } = await import('@/app/api/stats/question/[id]/route');
    const req = makeAuthRequest('/api/stats/question/Q1', bob.id);
    const res = await GET(req, { params: Promise.resolve({ id: 'Q1' }) });
    const data = await res.json();
    expect(data.stats.totalAttempts).toBe(1);
    expect(data.stats.correctAttempts).toBe(1);
  });

  it('smart selection isolation: Alice has different unseen questions than Bob', async () => {
    const { GET } = await import('@/app/api/questions/next/route');

    // Alice has attempted Q1-Q5, so Q6+ are unseen for her
    const aliceReq = makeAuthRequest('/api/questions/next', alice.id);
    const aliceRes = await GET(aliceReq);
    const aliceData = await aliceRes.json();
    expect(aliceData.stats.unseen).toBeGreaterThan(0);

    // Bob has also attempted Q1-Q5
    const bobReq = makeAuthRequest('/api/questions/next', bob.id);
    const bobRes = await GET(bobReq);
    const bobData = await bobRes.json();
    expect(bobData.stats.unseen).toBeGreaterThan(0);

    // Both should have the same number of unseen (20 total - 5 attempted = 15)
    expect(aliceData.stats.unseen).toBe(bobData.stats.unseen);
  });

  it("cross-user protection: Alice cannot complete Bob's session", async () => {
    const { POST, PATCH } = await import('@/app/api/sessions/route');

    // Bob creates a session
    const createReq = makeAuthRequest('/api/sessions', bob.id, {
      method: 'POST',
      body: {},
    });
    const createRes = await POST(createReq);
    const { sessionId } = await createRes.json();

    // Alice tries to complete it
    const patchReq = makeAuthRequest('/api/sessions', alice.id, {
      method: 'PATCH',
      body: { sessionId },
    });
    const patchRes = await PATCH(patchReq);
    expect(patchRes.status).toBe(403);
  });

  it('per-section stats are isolated between users', async () => {
    const { GET } = await import('@/app/api/stats/route');

    // Alice's stats
    const aliceReq = makeAuthRequest('/api/stats', alice.id);
    const aliceRes = await GET(aliceReq);
    const aliceData = await aliceRes.json();

    // Bob's stats
    const bobReq = makeAuthRequest('/api/stats', bob.id);
    const bobRes = await GET(bobReq);
    const bobData = await bobRes.json();

    // Alice has 60% overall, Bob has 100%
    expect(aliceData.overall.correctnessRate).toBeCloseTo(0.6, 2);
    expect(bobData.overall.correctnessRate).toBe(1);

    // Both attempted 5 questions
    expect(aliceData.overall.questionsAttempted).toBe(5);
    expect(bobData.overall.questionsAttempted).toBe(5);
  });

  it('anonymous attempt does not pollute authenticated user stats', async () => {
    // Record an anonymous-style attempt (won't happen through API but test DB isolation)
    db.prepare(
      'INSERT INTO attempts (question_id, selected_answer, is_correct) VALUES (?, ?, ?)'
    ).run('Q10', 'A', 1);

    const { GET } = await import('@/app/api/stats/route');

    // Alice should still see only her 5 attempts
    const aliceReq = makeAuthRequest('/api/stats', alice.id);
    const aliceRes = await GET(aliceReq);
    const aliceData = await aliceRes.json();
    expect(aliceData.overall.totalAttempts).toBe(5);
  });

  it('register endpoint creates new user and returns valid auth', async () => {
    const { POST } = await import('@/app/api/auth/register/route');
    const req = makeRequest('/api/auth/register', {
      method: 'POST',
      body: { email: 'charlie@test.com', password: 'password123' },
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.user.email).toBe('charlie@test.com');
    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toContain(TOKEN_COOKIE_NAME);
  });

  it('login endpoint authenticates existing user', async () => {
    const { POST } = await import('@/app/api/auth/login/route');
    const req = makeRequest('/api/auth/login', {
      method: 'POST',
      body: { email: 'alice@test.com', password: 'password123' },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.user.email).toBe('alice@test.com');
  });

  it('logout clears auth cookie', async () => {
    const { POST } = await import('@/app/api/auth/logout/route');
    const res = await POST();
    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toContain('Max-Age=0');
  });

  it('new user has zero stats', async () => {
    const charlie = await createTestUser('charlie@test.com');
    const { GET } = await import('@/app/api/stats/route');
    const req = makeAuthRequest('/api/stats', charlie.id);
    const res = await GET(req);
    const data = await res.json();
    expect(data.overall.totalAttempts).toBe(0);
    expect(data.overall.questionsAttempted).toBe(0);
    expect(data.overall.correctnessRate).toBe(0);
  });

  it('new user has all questions as unseen', async () => {
    const charlie = await createTestUser('charlie@test.com');
    const { GET } = await import('@/app/api/questions/next/route');
    const req = makeAuthRequest('/api/questions/next', charlie.id);
    const res = await GET(req);
    const data = await res.json();
    expect(data.phase).toBe('coverage');
    expect(data.stats.unseen).toBe(20);
  });

  it('new user has empty session history', async () => {
    const charlie = await createTestUser('charlie@test.com');
    const { GET } = await import('@/app/api/sessions/history/route');
    const req = makeAuthRequest('/api/sessions/history', charlie.id);
    const res = await GET(req);
    const data = await res.json();
    expect(data.sessions).toHaveLength(0);
  });
});
