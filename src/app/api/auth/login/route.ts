import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { findUserByEmail, toSafeUser } from '@/lib/users';
import { verifyPassword, createToken, TOKEN_COOKIE_NAME, COOKIE_OPTIONS } from '@/lib/auth';

export async function POST(request: NextRequest) {
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { email, password } = body;

  if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
  }

  const db = getDb();
  const user = findUserByEmail(db, email);

  if (!user) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const token = await createToken({ userId: user.id, email: user.email });

  const response = NextResponse.json({ user: toSafeUser(user) });
  response.cookies.set(TOKEN_COOKIE_NAME, token, COOKIE_OPTIONS);
  return response;
}
