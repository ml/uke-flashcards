import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { findUserById, toSafeUser } from '@/lib/users';
import { getUserIdFromRequest } from '@/lib/auth-helpers';

export async function GET(request: NextRequest) {
  const userId = getUserIdFromRequest(request);

  if (!userId) {
    return NextResponse.json({ user: null });
  }

  const db = getDb();
  const user = findUserById(db, userId);

  if (!user) {
    return NextResponse.json({ user: null });
  }

  return NextResponse.json({ user: toSafeUser(user) });
}
