export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getAlphabetIds } from '@/lib/alphabet';
import { getQuestionStats, getStatsSummary } from '@/lib/questionStats';
import { getUserIdFromRequest } from '@/lib/auth-helpers';
import type { AlphabetStats } from '@/types/alphabet';

/**
 * GET /api/alphabet/stats
 *
 * Returns progress statistics for both Polish and NATO alphabets.
 * Scoped to authenticated user.
 */
export async function GET(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  const db = getDb();
  const statsMap = getQuestionStats(db, userId ?? null);

  const polishIds = getAlphabetIds('polish');
  const natoIds = getAlphabetIds('nato');

  const polishRaw = getStatsSummary(polishIds, statsMap);
  const natoRaw = getStatsSummary(natoIds, statsMap);

  const polishStats: AlphabetStats = {
    total: polishRaw.total,
    unseen: polishRaw.unseen,
    weak: polishRaw.weak,
    learning: polishRaw.learning,
    strong: polishRaw.strong,
    mastered: polishRaw.mastered,
  };

  const natoStats: AlphabetStats = {
    total: natoRaw.total,
    unseen: natoRaw.unseen,
    weak: natoRaw.weak,
    learning: natoRaw.learning,
    strong: natoRaw.strong,
    mastered: natoRaw.mastered,
  };

  return NextResponse.json({
    polish: polishStats,
    nato: natoStats,
  });
}
