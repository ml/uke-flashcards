import { NextRequest, NextResponse } from 'next/server';
import { getAlphabet } from '@/lib/alphabet';
import type { AlphabetType } from '@/types/alphabet';

/**
 * GET /api/alphabet/all
 *
 * Returns all letters for a given alphabet type.
 * Used for generating quiz distractors.
 *
 * Query params:
 * - type: 'polish' | 'nato' (required)
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const typeParam = searchParams.get('type') as AlphabetType | null;

  if (!typeParam || (typeParam !== 'polish' && typeParam !== 'nato')) {
    return NextResponse.json(
      { error: 'Missing or invalid "type" parameter. Must be "polish" or "nato".' },
      { status: 400 }
    );
  }

  const letters = getAlphabet(typeParam);

  return NextResponse.json({
    letters,
    count: letters.length,
  });
}
