import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from './helpers';
import { _setDbForTest } from '@/lib/db';
import { hashPassword, createToken, TOKEN_COOKIE_NAME } from '@/lib/auth';
import { createUser } from '@/lib/users';

// Mock questions module
vi.mock('@/lib/questions', () => {
  const questions = [
    {
      id: 'Q1',
      number: 1,
      text: 'Test question 1',
      answers: [
        { letter: 'A', text: 'Answer A' },
        { letter: 'B', text: 'Answer B' },
        { letter: 'C', text: 'Answer C' },
      ],
      correctAnswerLetter: 'A',
      section: 'Radiotechnika',
    },
    {
      id: 'Q2',
      number: 2,
      text: 'Test question 2',
      answers: [
        { letter: 'A', text: 'Answer A' },
        { letter: 'B', text: 'Answer B' },
        { letter: 'C', text: 'Answer C' },
      ],
      correctAnswerLetter: 'B',
      section: 'Przepisy',
    },
    {
      id: 'Q3',
      number: 3,
      text: 'Test question 3',
      answers: [
        { letter: 'A', text: 'Answer A' },
        { letter: 'B', text: 'Answer B' },
        { letter: 'C', text: 'Answer C' },
      ],
      correctAnswerLetter: 'C',
      section: 'Bezpieczeństwo',
    },
    {
      id: 'Q4',
      number: 4,
      text: 'Test question 4',
      answers: [
        { letter: 'A', text: 'Answer A' },
        { letter: 'B', text: 'Answer B' },
        { letter: 'C', text: 'Answer C' },
      ],
      correctAnswerLetter: 'A',
      section: 'Procedury operatorskie',
    },
  ];

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
    cookies?: Record<string, string>;
  } = {}
) {
  const { method = 'GET', body, headers = {}, cookies = {} } = options;
  const reqHeaders = new Headers(headers);
  if (body) {
    reqHeaders.set('content-type', 'application/json');
  }
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

async function createTestUser(email: string): Promise<{ id: number; token: string }> {
  const hash = await hashPassword('password123');
  const user = createUser(db, email, hash);
  const token = await createToken({ userId: user.id, email: user.email });
  return { id: user.id, token };
}

function makeAuthRequest(
  url: string,
  userId: number,
  options: {
    method?: string;
    body?: unknown;
  } = {}
) {
  return makeRequest(url, {
    ...options,
    headers: { 'x-user-id': String(userId) },
  });
}

beforeEach(async () => {
  db = createTestDb();
  _setDbForTest(db);
});

afterEach(() => {
  _setDbForTest(null);
});

describe('POST /api/attempts', () => {
  it('with auth stores user_id in DB', async () => {
    const { POST } = await import('@/app/api/attempts/route');
    const alice = await createTestUser('alice@test.com');

    const req = makeAuthRequest('/api/attempts', alice.id, {
      method: 'POST',
      body: { questionId: 'Q1', selectedAnswer: 'A' },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const attempt = db.prepare('SELECT user_id FROM attempts WHERE id = 1').get() as { user_id: number };
    expect(attempt.user_id).toBe(alice.id);
  });

  it('without auth returns result but does not persist', async () => {
    const { POST } = await import('@/app/api/attempts/route');

    const req = makeRequest('/api/attempts', {
      method: 'POST',
      body: { questionId: 'Q1', selectedAnswer: 'A' },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.isCorrect).toBe(true);
    expect(data.id).toBeNull();

    // Verify nothing in DB
    const count = db.prepare('SELECT COUNT(*) as c FROM attempts').get() as { c: number };
    expect(count.c).toBe(0);
  });
});

describe('POST /api/sessions', () => {
  it('with auth creates session with user_id', async () => {
    const { POST } = await import('@/app/api/sessions/route');
    const alice = await createTestUser('alice@test.com');

    const req = makeAuthRequest('/api/sessions', alice.id, {
      method: 'POST',
      body: {},
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.sessionId).toBeTruthy();

    const session = db.prepare('SELECT user_id FROM sessions WHERE id = ?').get(data.sessionId) as { user_id: number };
    expect(session.user_id).toBe(alice.id);
  });

  it('without auth returns 401', async () => {
    const { POST } = await import('@/app/api/sessions/route');

    const req = makeRequest('/api/sessions', {
      method: 'POST',
      body: {},
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/sessions', () => {
  it('with auth completes own session', async () => {
    const { POST, PATCH } = await import('@/app/api/sessions/route');
    const alice = await createTestUser('alice@test.com');

    // Create session
    const createReq = makeAuthRequest('/api/sessions', alice.id, {
      method: 'POST',
      body: {},
    });
    const createRes = await POST(createReq);
    const { sessionId } = await createRes.json();

    // Complete it
    const patchReq = makeAuthRequest('/api/sessions', alice.id, {
      method: 'PATCH',
      body: { sessionId },
    });
    const patchRes = await PATCH(patchReq);
    expect(patchRes.status).toBe(200);
    const patchData = await patchRes.json();
    expect(patchData.completed).toBe(true);
  });

  it("with auth rejects other user's session (403)", async () => {
    const { POST, PATCH } = await import('@/app/api/sessions/route');
    const alice = await createTestUser('alice@test.com');
    const bob = await createTestUser('bob@test.com');

    // Alice creates session
    const createReq = makeAuthRequest('/api/sessions', alice.id, {
      method: 'POST',
      body: {},
    });
    const createRes = await POST(createReq);
    const { sessionId } = await createRes.json();

    // Bob tries to complete it
    const patchReq = makeAuthRequest('/api/sessions', bob.id, {
      method: 'PATCH',
      body: { sessionId },
    });
    const patchRes = await PATCH(patchReq);
    expect(patchRes.status).toBe(403);
  });
});

describe('GET /api/sessions/history', () => {
  it("returns only user's sessions", async () => {
    const { GET } = await import('@/app/api/sessions/history/route');
    const alice = await createTestUser('alice@test.com');
    const bob = await createTestUser('bob@test.com');

    // Create sessions for both users
    db.prepare('INSERT INTO sessions (user_id) VALUES (?)').run(alice.id);
    db.prepare('INSERT INTO sessions (user_id) VALUES (?)').run(bob.id);

    const req = makeAuthRequest('/api/sessions/history', alice.id);
    const res = await GET(req);
    const data = await res.json();
    expect(data.sessions).toHaveLength(1);
  });

  it('without auth returns empty array', async () => {
    const { GET } = await import('@/app/api/sessions/history/route');

    db.prepare('INSERT INTO sessions DEFAULT VALUES').run();

    const req = makeRequest('/api/sessions/history');
    const res = await GET(req);
    const data = await res.json();
    expect(data.sessions).toHaveLength(0);
  });
});

describe('GET /api/stats', () => {
  it('with auth returns scoped stats', async () => {
    const { GET } = await import('@/app/api/stats/route');
    const alice = await createTestUser('alice@test.com');

    // Add some attempts for Alice
    db.prepare('INSERT INTO attempts (question_id, selected_answer, is_correct, user_id) VALUES (?, ?, ?, ?)')
      .run('Q1', 'A', 1, alice.id);

    const req = makeAuthRequest('/api/stats', alice.id);
    const res = await GET(req);
    const data = await res.json();
    expect(data.overall.totalAttempts).toBe(1);
    expect(data.overall.correctAttempts).toBe(1);
  });

  it('without auth returns zeros', async () => {
    const { GET } = await import('@/app/api/stats/route');

    // Add some attempts (anonymous/orphaned)
    db.prepare('INSERT INTO attempts (question_id, selected_answer, is_correct) VALUES (?, ?, ?)')
      .run('Q1', 'A', 1);

    const req = makeRequest('/api/stats');
    const res = await GET(req);
    const data = await res.json();
    expect(data.overall.totalAttempts).toBe(0);
    expect(data.overall.questionsAttempted).toBe(0);
  });
});

describe('GET /api/stats/question/[id]', () => {
  it('scoped to user', async () => {
    const { GET } = await import('@/app/api/stats/question/[id]/route');
    const alice = await createTestUser('alice@test.com');
    const bob = await createTestUser('bob@test.com');

    // Alice attempts Q1
    db.prepare('INSERT INTO attempts (question_id, selected_answer, is_correct, user_id) VALUES (?, ?, ?, ?)')
      .run('Q1', 'A', 1, alice.id);
    // Bob attempts Q1
    db.prepare('INSERT INTO attempts (question_id, selected_answer, is_correct, user_id) VALUES (?, ?, ?, ?)')
      .run('Q1', 'B', 0, bob.id);

    const req = makeAuthRequest('/api/stats/question/Q1', alice.id);
    const res = await GET(req, { params: Promise.resolve({ id: 'Q1' }) });
    const data = await res.json();
    expect(data.stats.totalAttempts).toBe(1);
    expect(data.stats.correctAttempts).toBe(1);
  });
});

describe('GET /api/questions/next', () => {
  it('with auth uses user-scoped stats', async () => {
    const { GET } = await import('@/app/api/questions/next/route');
    const alice = await createTestUser('alice@test.com');

    const req = makeAuthRequest('/api/questions/next?section=Radiotechnika', alice.id);
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.question).toBeTruthy();
    expect(data.stats).toBeTruthy();
  });

  it('without auth returns question (all unseen)', async () => {
    const { GET } = await import('@/app/api/questions/next/route');

    const req = makeRequest('/api/questions/next?section=Radiotechnika');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.question).toBeTruthy();
    expect(data.phase).toBe('coverage');
  });
});

describe('Multi-user isolation', () => {
  it('Alice and Bob have isolated stats', async () => {
    const { GET } = await import('@/app/api/stats/route');
    const alice = await createTestUser('alice@test.com');
    const bob = await createTestUser('bob@test.com');

    // Alice: 5 attempts, 3 correct
    for (let i = 0; i < 3; i++) {
      db.prepare('INSERT INTO attempts (question_id, selected_answer, is_correct, user_id) VALUES (?, ?, ?, ?)')
        .run('Q1', 'A', 1, alice.id);
    }
    for (let i = 0; i < 2; i++) {
      db.prepare('INSERT INTO attempts (question_id, selected_answer, is_correct, user_id) VALUES (?, ?, ?, ?)')
        .run('Q1', 'B', 0, alice.id);
    }

    // Bob: 5 attempts, 5 correct
    for (let i = 0; i < 5; i++) {
      db.prepare('INSERT INTO attempts (question_id, selected_answer, is_correct, user_id) VALUES (?, ?, ?, ?)')
        .run('Q1', 'A', 1, bob.id);
    }

    // Verify Alice
    const aliceReq = makeAuthRequest('/api/stats', alice.id);
    const aliceRes = await GET(aliceReq);
    const aliceData = await aliceRes.json();
    expect(aliceData.overall.totalAttempts).toBe(5);
    expect(aliceData.overall.correctAttempts).toBe(3);

    // Verify Bob
    const bobReq = makeAuthRequest('/api/stats', bob.id);
    const bobRes = await GET(bobReq);
    const bobData = await bobRes.json();
    expect(bobData.overall.totalAttempts).toBe(5);
    expect(bobData.overall.correctAttempts).toBe(5);
  });
});
