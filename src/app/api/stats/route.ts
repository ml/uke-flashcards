export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getQuestions, getSections } from '@/lib/questions';
import { getUserIdFromRequest } from '@/lib/auth-helpers';

interface QuestionStatsRow {
  question_id: string;
  total_attempts: number;
  correct_attempts: number;
  correctness_rate: number;
}

/**
 * GET /api/stats
 * Returns comprehensive statistics for the dashboard.
 * Scoped to authenticated user. Anonymous users get zeros.
 */
export async function GET(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  const db = getDb();
  const allQuestions = getQuestions();
  const allSections = getSections();

  if (!userId) {
    // Anonymous: return zero stats
    const zeroSections: Record<string, {
      totalQuestions: number;
      questionsAttempted: number;
      totalAttempts: number;
      correctAttempts: number;
      correctnessRate: number;
      passingStatus: boolean;
    }> = {};
    for (const section of allSections) {
      const sectionQuestions = allQuestions.filter((q) => q.section === section);
      zeroSections[section] = {
        totalQuestions: sectionQuestions.length,
        questionsAttempted: 0,
        totalAttempts: 0,
        correctAttempts: 0,
        correctnessRate: 0,
        passingStatus: false,
      };
    }
    return NextResponse.json({
      overall: {
        totalQuestions: allQuestions.length,
        questionsAttempted: 0,
        totalAttempts: 0,
        correctAttempts: 0,
        correctnessRate: 0,
      },
      bySection: zeroSections,
      weakAreas: [],
    });
  }

  // Create a map for quick question lookups
  const questionMap = new Map(allQuestions.map((q) => [q.id, q]));

  // Get per-question statistics scoped to user
  const questionStats = db
    .prepare(
      `
      SELECT
        question_id,
        COUNT(*) as total_attempts,
        SUM(is_correct) as correct_attempts,
        CAST(SUM(is_correct) AS FLOAT) / COUNT(*) as correctness_rate
      FROM attempts
      WHERE user_id = ?
      GROUP BY question_id
    `
    )
    .all(userId) as QuestionStatsRow[];

  const statsMap = new Map(questionStats.map((s) => [s.question_id, s]));

  // Calculate per-section statistics
  const sectionStats: Record<
    string,
    {
      totalQuestions: number;
      questionsAttempted: number;
      totalAttempts: number;
      correctAttempts: number;
      correctnessRate: number;
      passingStatus: boolean;
    }
  > = {};

  for (const section of allSections) {
    const sectionQuestions = allQuestions.filter((q) => q.section === section);
    const totalQuestions = sectionQuestions.length;

    let questionsAttempted = 0;
    let totalAttempts = 0;
    let correctAttempts = 0;

    for (const q of sectionQuestions) {
      const stat = statsMap.get(q.id);
      if (stat) {
        questionsAttempted++;
        totalAttempts += stat.total_attempts;
        correctAttempts += stat.correct_attempts;
      }
    }

    const correctnessRate = totalAttempts > 0 ? correctAttempts / totalAttempts : 0;

    sectionStats[section] = {
      totalQuestions,
      questionsAttempted,
      totalAttempts,
      correctAttempts,
      correctnessRate,
      passingStatus: correctnessRate >= 0.6,
    };
  }

  // Get weak areas: questions with lowest correctness rate (minimum 3 attempts)
  const weakQuestions = questionStats
    .filter((s) => s.total_attempts >= 3)
    .sort((a, b) => a.correctness_rate - b.correctness_rate)
    .slice(0, 10)
    .map((s) => {
      const question = questionMap.get(s.question_id);
      return {
        id: s.question_id,
        number: question?.number,
        text: question?.text,
        section: question?.section,
        totalAttempts: s.total_attempts,
        correctAttempts: s.correct_attempts,
        correctnessRate: s.correctness_rate,
      };
    });

  // Get overall totals scoped to user
  const overallStats = db
    .prepare(
      `
      SELECT
        COUNT(*) as total_attempts,
        SUM(is_correct) as correct_attempts
      FROM attempts
      WHERE user_id = ?
    `
    )
    .get(userId) as { total_attempts: number; correct_attempts: number };

  return NextResponse.json({
    overall: {
      totalQuestions: allQuestions.length,
      questionsAttempted: questionStats.length,
      totalAttempts: overallStats.total_attempts || 0,
      correctAttempts: overallStats.correct_attempts || 0,
      correctnessRate:
        overallStats.total_attempts > 0
          ? overallStats.correct_attempts / overallStats.total_attempts
          : 0,
    },
    bySection: sectionStats,
    weakAreas: weakQuestions,
  });
}
