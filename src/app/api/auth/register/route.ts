import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { createUser, findUserByEmail, toSafeUser } from '@/lib/users';
import { hashPassword, createToken, TOKEN_COOKIE_NAME, COOKIE_OPTIONS } from '@/lib/auth';

export async function POST(request: NextRequest) {
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { email, password } = body;

  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  }

  if (!password || typeof password !== 'string') {
    return NextResponse.json({ error: 'Password is required' }, { status: 400 });
  }

  // Basic email validation
  if (!email.includes('@') || !email.includes('.')) {
    return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json(
      { error: 'Password must be at least 8 characters' },
      { status: 400 }
    );
  }

  const db = getDb();

  // Check for duplicate email
  const existing = findUserByEmail(db, email);
  if (existing) {
    return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const user = createUser(db, email, passwordHash);
  const token = await createToken({ userId: user.id, email: user.email });

  const response = NextResponse.json({ user: toSafeUser(user) }, { status: 201 });
  response.cookies.set(TOKEN_COOKIE_NAME, token, COOKIE_OPTIONS);
  return response;
}
