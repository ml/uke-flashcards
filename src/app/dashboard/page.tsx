'use client';

import { useEffect, useState } from 'react';

interface SectionStat {
  totalQuestions: number;
  questionsAttempted: number;
  totalAttempts: number;
  correctAttempts: number;
  correctnessRate: number;
  passingStatus: boolean;
}

interface WeakQuestion {
  id: string;
  number: number;
  text: string;
  section: string;
  totalAttempts: number;
  correctAttempts: number;
  correctnessRate: number;
}

interface DashboardStats {
  overall: {
    totalQuestions: number;
    questionsAttempted: number;
    totalAttempts: number;
    correctAttempts: number;
    correctnessRate: number;
  };
  bySection: Record<string, SectionStat>;
  weakAreas: WeakQuestion[];
}

interface QuestionAttempt {
  id: number;
  selectedAnswer: string;
  isCorrect: boolean;
  createdAt: string;
  sessionId: number | null;
}

interface QuestionDetail {
  question: {
    id: string;
    number: number;
    text: string;
    section: string;
    answers: { letter: string; text: string }[];
    correctAnswerLetter: string;
  };
  stats: {
    totalAttempts: number;
    correctAttempts: number;
    correctnessRate: number;
  };
  attempts: QuestionAttempt[];
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedQuestion, setSelectedQuestion] = useState<string | null>(null);
  const [questionDetail, setQuestionDetail] = useState<QuestionDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    fetchStats();
  }, []);

  async function fetchStats() {
    try {
      const response = await fetch('/api/stats');
      if (!response.ok) {
        throw new Error('Failed to fetch statistics');
      }
      const data = await response.json();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }

  async function fetchQuestionDetail(questionId: string) {
    setSelectedQuestion(questionId);
    setLoadingDetail(true);
    try {
      const response = await fetch(`/api/stats/question/${questionId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch question details');
      }
      const data = await response.json();
      setQuestionDetail(data);
    } catch (err) {
      console.error('Failed to fetch question details:', err);
    } finally {
      setLoadingDetail(false);
    }
  }

  function closeQuestionDetail() {
    setSelectedQuestion(null);
    setQuestionDetail(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-slate-600">Loading statistics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-red-600">{error}</div>
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  const formatPercentage = (rate: number) => `${(rate * 100).toFixed(1)}%`;

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold text-slate-800">Dashboard</h1>

      {/* Overall Statistics */}
      <section className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-slate-800 mb-4">Overall Progress</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Total Questions"
            value={stats.overall.totalQuestions}
          />
          <StatCard
            label="Questions Attempted"
            value={stats.overall.questionsAttempted}
            subtext={`${((stats.overall.questionsAttempted / stats.overall.totalQuestions) * 100).toFixed(1)}% coverage`}
          />
          <StatCard
            label="Total Attempts"
            value={stats.overall.totalAttempts}
          />
          <StatCard
            label="Correctness Rate"
            value={formatPercentage(stats.overall.correctnessRate)}
            className={stats.overall.correctnessRate >= 0.6 ? 'text-green-600' : 'text-red-600'}
          />
        </div>
      </section>

      {/* Per-Section Statistics */}
      <section className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-slate-800 mb-4">Progress by Section</h2>
        <div className="space-y-4">
          {Object.entries(stats.bySection).map(([section, sectionStat]) => (
            <SectionRow key={section} section={section} stat={sectionStat} />
          ))}
        </div>
      </section>

      {/* Weak Areas */}
      <section className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-slate-800 mb-4">
          Weak Areas
          <span className="text-sm font-normal text-slate-500 ml-2">
            (questions with lowest correctness rate, min. 3 attempts)
          </span>
        </h2>
        {stats.weakAreas.length === 0 ? (
          <p className="text-slate-500">
            No weak areas identified yet. Keep practicing to see questions that need more work.
          </p>
        ) : (
          <div className="space-y-2">
            {stats.weakAreas.map((question) => (
              <WeakQuestionRow
                key={question.id}
                question={question}
                onClick={() => fetchQuestionDetail(question.id)}
                isSelected={selectedQuestion === question.id}
              />
            ))}
          </div>
        )}
      </section>

      {/* Question Detail Modal */}
      {selectedQuestion && (
        <QuestionDetailModal
          detail={questionDetail}
          loading={loadingDetail}
          onClose={closeQuestionDetail}
        />
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  subtext,
  className = '',
}: {
  label: string;
  value: string | number;
  subtext?: string;
  className?: string;
}) {
  return (
    <div className="bg-slate-50 rounded-lg p-4">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={`text-2xl font-bold ${className || 'text-slate-800'}`}>{value}</div>
      {subtext && <div className="text-xs text-slate-400 mt-1">{subtext}</div>}
    </div>
  );
}

function SectionRow({ section, stat }: { section: string; stat: SectionStat }) {
  const percentage = stat.correctnessRate * 100;
  const isPassing = stat.passingStatus;

  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <span className="font-medium text-slate-800">{section}</span>
          <span
            className={`px-2 py-0.5 text-xs font-medium rounded-full ${
              isPassing
                ? 'bg-green-100 text-green-700'
                : stat.totalAttempts > 0
                  ? 'bg-red-100 text-red-700'
                  : 'bg-slate-100 text-slate-500'
            }`}
          >
            {stat.totalAttempts > 0 ? (isPassing ? 'PASS' : 'FAIL') : 'No attempts'}
          </span>
        </div>
        <div className="text-sm text-slate-500">
          {stat.questionsAttempted} / {stat.totalQuestions} questions attempted
        </div>
      </div>
      <div className="relative h-3 bg-slate-200 rounded-full overflow-hidden">
        <div
          className={`absolute left-0 top-0 h-full transition-all ${
            isPassing ? 'bg-green-500' : stat.totalAttempts > 0 ? 'bg-red-500' : 'bg-slate-300'
          }`}
          style={{ width: `${percentage}%` }}
        />
        {/* 60% threshold marker */}
        <div
          className="absolute top-0 w-0.5 h-full bg-slate-600"
          style={{ left: '60%' }}
          title="60% passing threshold"
        />
      </div>
      <div className="flex justify-between text-sm mt-1">
        <span className="text-slate-500">
          {stat.correctAttempts} / {stat.totalAttempts} correct
        </span>
        <span className={isPassing ? 'text-green-600' : 'text-slate-600'}>
          {percentage.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

function WeakQuestionRow({
  question,
  onClick,
  isSelected,
}: {
  question: WeakQuestion;
  onClick: () => void;
  isSelected: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-lg border transition-colors ${
        isSelected
          ? 'border-blue-500 bg-blue-50'
          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-600">#{question.number}</span>
            <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-500 rounded">
              {question.section}
            </span>
          </div>
          <div className="text-slate-800 mt-1 line-clamp-1">{question.text}</div>
        </div>
        <div className="ml-4 text-right">
          <div className="text-lg font-bold text-red-600">
            {(question.correctnessRate * 100).toFixed(0)}%
          </div>
          <div className="text-xs text-slate-500">
            {question.correctAttempts}/{question.totalAttempts}
          </div>
        </div>
      </div>
    </button>
  );
}

function QuestionDetailModal({
  detail,
  loading,
  onClose,
}: {
  detail: QuestionDetail | null;
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="font-semibold text-lg">Question Details</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors text-2xl leading-none"
          >
            ×
          </button>
        </div>
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-60px)]">
          {loading ? (
            <div className="text-center text-slate-500 py-8">Loading...</div>
          ) : detail ? (
            <div className="space-y-6">
              {/* Question Info */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-medium text-slate-500">
                    Question #{detail.question.number}
                  </span>
                  <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-500 rounded">
                    {detail.question.section}
                  </span>
                </div>
                <p className="text-slate-800 font-medium">{detail.question.text}</p>
              </div>

              {/* Answers */}
              <div className="space-y-2">
                {detail.question.answers.map((answer) => (
                  <div
                    key={answer.letter}
                    className={`p-3 rounded-lg border ${
                      answer.letter === detail.question.correctAnswerLetter
                        ? 'border-green-300 bg-green-50'
                        : 'border-slate-200'
                    }`}
                  >
                    <span className="font-medium mr-2">{answer.letter}.</span>
                    {answer.text}
                    {answer.letter === detail.question.correctAnswerLetter && (
                      <span className="ml-2 text-green-600 text-sm">(correct)</span>
                    )}
                  </div>
                ))}
              </div>

              {/* Statistics */}
              <div className="grid grid-cols-3 gap-4 bg-slate-50 rounded-lg p-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-slate-800">
                    {detail.stats.totalAttempts}
                  </div>
                  <div className="text-sm text-slate-500">Total Attempts</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {detail.stats.correctAttempts}
                  </div>
                  <div className="text-sm text-slate-500">Correct</div>
                </div>
                <div className="text-center">
                  <div
                    className={`text-2xl font-bold ${
                      detail.stats.correctnessRate >= 0.6 ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    {(detail.stats.correctnessRate * 100).toFixed(1)}%
                  </div>
                  <div className="text-sm text-slate-500">Success Rate</div>
                </div>
              </div>

              {/* Attempt History */}
              <div>
                <h4 className="font-medium text-slate-800 mb-3">Attempt History</h4>
                <div className="space-y-2">
                  {detail.attempts.map((attempt) => (
                    <div
                      key={attempt.id}
                      className={`flex items-center justify-between p-3 rounded-lg border ${
                        attempt.isCorrect
                          ? 'border-green-200 bg-green-50'
                          : 'border-red-200 bg-red-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-sm ${
                            attempt.isCorrect
                              ? 'bg-green-500 text-white'
                              : 'bg-red-500 text-white'
                          }`}
                        >
                          {attempt.isCorrect ? '✓' : '✗'}
                        </span>
                        <span className="text-slate-700">
                          Answered: <strong>{attempt.selectedAnswer}</strong>
                        </span>
                        {attempt.sessionId && (
                          <span className="text-xs text-slate-400">
                            (Session #{attempt.sessionId})
                          </span>
                        )}
                      </div>
                      <span className="text-sm text-slate-500">
                        {new Date(attempt.createdAt).toLocaleString('pl-PL')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center text-slate-500 py-8">No data available</div>
          )}
        </div>
      </div>
    </div>
  );
}
