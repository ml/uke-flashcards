'use client';

import { Suspense, useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import type { Question, Section } from '@/types/questions';
import { useHints } from '@/components/HintsContext';

interface AttemptResponse {
  id: number;
  isCorrect: boolean;
  correctAnswer: string;
}

interface SessionStats {
  total: number;
  correct: number;
  incorrect: number;
  bySection: Record<string, { total: number; correct: number }>;
}

interface SessionData {
  sessionId: number;
  questions: Question[];
  totalQuestions: number;
}

const ALL_SECTIONS: Section[] = [
  'Radiotechnika',
  'Przepisy',
  'Bezpieczeństwo',
  'Procedury operatorskie',
];

function StudyContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { hintsEnabled, isHydrated } = useHints();

  const [allQuestions, setAllQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [attemptResult, setAttemptResult] = useState<AttemptResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Session mode state
  const [sessionMode, setSessionMode] = useState(false);
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [sessionCompleted, setSessionCompleted] = useState(false);
  const [sessionStats, setSessionStats] = useState<SessionStats | null>(null);
  const [startingSession, setStartingSession] = useState(false);

  // Get selected section from URL params
  const selectedSection = searchParams.get('section') as Section | null;

  // Filter questions by section
  const questions = useMemo(() => {
    if (sessionMode && sessionData) {
      return sessionData.questions;
    }
    if (!selectedSection) {
      return allQuestions;
    }
    return allQuestions.filter((q) => q.section === selectedSection);
  }, [allQuestions, selectedSection, sessionMode, sessionData]);

  useEffect(() => {
    async function loadQuestions() {
      try {
        const response = await fetch('/api/questions');
        if (!response.ok) {
          throw new Error('Failed to load questions');
        }
        const data = await response.json();
        setAllQuestions(data.questions);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    }
    loadQuestions();
  }, []);

  // Reset index when section changes (only in non-session mode)
  useEffect(() => {
    if (!sessionMode) {
      setCurrentIndex(0);
      setSelectedAnswer(null);
      setAttemptResult(null);
    }
  }, [selectedSection, sessionMode]);

  const handleSectionChange = useCallback(
    (section: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (section === '') {
        params.delete('section');
      } else {
        params.set('section', section);
      }
      router.push(`/study?${params.toString()}`);
    },
    [router, searchParams]
  );

  async function handleStartSession() {
    setStartingSession(true);
    try {
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section: selectedSection,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to start session');
      }

      const data: SessionData = await response.json();
      setSessionData(data);
      setSessionMode(true);
      setCurrentIndex(0);
      setSelectedAnswer(null);
      setAttemptResult(null);
      setSessionCompleted(false);
      setSessionStats(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start session');
    } finally {
      setStartingSession(false);
    }
  }

  async function handleCompleteSession() {
    if (!sessionData) return;

    try {
      const response = await fetch('/api/sessions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionData.sessionId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to complete session');
      }

      const data = await response.json();
      setSessionStats(data.stats);
      setSessionCompleted(true);
    } catch (err) {
      console.error('Error completing session:', err);
    }
  }

  function handleExitSession() {
    setSessionMode(false);
    setSessionData(null);
    setSessionCompleted(false);
    setSessionStats(null);
    setCurrentIndex(0);
    setSelectedAnswer(null);
    setAttemptResult(null);
  }

  const currentQuestion = questions[currentIndex];

  async function handleAnswerClick(answerLetter: string) {
    if (selectedAnswer !== null) {
      return; // Already answered
    }

    setSelectedAnswer(answerLetter);

    try {
      const response = await fetch('/api/attempts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionId: currentQuestion.id,
          selectedAnswer: answerLetter,
          sessionId: sessionData?.sessionId ?? null,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to record attempt');
      }

      const result: AttemptResponse = await response.json();
      setAttemptResult(result);
    } catch (err) {
      console.error('Error recording attempt:', err);
    }
  }

  function handleNextQuestion() {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setSelectedAnswer(null);
      setAttemptResult(null);
    } else if (sessionMode && !sessionCompleted) {
      // Last question in session, complete it
      handleCompleteSession();
    }
  }

  function handlePreviousQuestion() {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setSelectedAnswer(null);
      setAttemptResult(null);
    }
  }

  function getAnswerButtonClass(answerLetter: string): string {
    const baseClass =
      'w-full text-left p-4 rounded-lg border-2 transition-colors';

    if (selectedAnswer === null) {
      return `${baseClass} border-slate-200 bg-white hover:border-blue-400 hover:bg-blue-50 cursor-pointer`;
    }

    // After answering
    if (answerLetter === attemptResult?.correctAnswer) {
      return `${baseClass} border-green-500 bg-green-50 text-green-800`;
    }

    if (answerLetter === selectedAnswer && !attemptResult?.isCorrect) {
      return `${baseClass} border-red-500 bg-red-50 text-red-800`;
    }

    return `${baseClass} border-slate-200 bg-slate-50 text-slate-500 cursor-not-allowed`;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-slate-600">Loading questions...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-red-600">Error: {error}</div>
      </div>
    );
  }

  // Session summary view
  if (sessionMode && sessionCompleted && sessionStats) {
    const passThreshold = 0.6;
    const passRate = sessionStats.correct / sessionStats.total;
    const passed = passRate >= passThreshold;

    return (
      <div className="space-y-6">
        <div className="bg-white rounded-xl shadow-md p-8">
          <h2 className="text-2xl font-bold text-slate-800 mb-6 text-center">
            Session Complete!
          </h2>

          {/* Overall score */}
          <div
            className={`text-center p-6 rounded-lg mb-6 ${
              passed ? 'bg-green-100' : 'bg-red-100'
            }`}
          >
            <div className="text-5xl font-bold mb-2">
              {sessionStats.correct} / {sessionStats.total}
            </div>
            <div
              className={`text-lg font-medium ${
                passed ? 'text-green-700' : 'text-red-700'
              }`}
            >
              {Math.round(passRate * 100)}% -{' '}
              {passed ? 'Passed!' : 'Keep practicing!'}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-green-50 p-4 rounded-lg text-center">
              <div className="text-3xl font-bold text-green-700">
                {sessionStats.correct}
              </div>
              <div className="text-sm text-green-600">Correct</div>
            </div>
            <div className="bg-red-50 p-4 rounded-lg text-center">
              <div className="text-3xl font-bold text-red-700">
                {sessionStats.incorrect}
              </div>
              <div className="text-sm text-red-600">Incorrect</div>
            </div>
          </div>

          {/* Section breakdown */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-slate-700 mb-3">
              By Section
            </h3>
            <div className="space-y-2">
              {Object.entries(sessionStats.bySection).map(([section, stats]) => {
                const sectionRate = stats.correct / stats.total;
                return (
                  <div
                    key={section}
                    className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                  >
                    <span className="text-slate-700">{section}</span>
                    <span
                      className={`font-medium ${
                        sectionRate >= passThreshold
                          ? 'text-green-600'
                          : 'text-red-600'
                      }`}
                    >
                      {stats.correct} / {stats.total} (
                      {Math.round(sectionRate * 100)}%)
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-center gap-4">
            <button
              onClick={handleStartSession}
              disabled={startingSession}
              className="px-6 py-3 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {startingSession ? 'Starting...' : 'Start New Session'}
            </button>
            <button
              onClick={handleExitSession}
              className="px-6 py-3 rounded-lg bg-slate-200 text-slate-700 font-medium hover:bg-slate-300 transition-colors"
            >
              Exit to Study Mode
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="space-y-6">
        {/* Section filter */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <label htmlFor="section-filter" className="text-sm font-medium text-slate-700">
              Section:
            </label>
            <select
              id="section-filter"
              value={selectedSection || ''}
              onChange={(e) => handleSectionChange(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All sections</option>
              {ALL_SECTIONS.map((section) => (
                <option key={section} value={section}>
                  {section}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-center py-12">
          <div className="text-slate-600">No questions available for this section</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with section filter and session button */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <label htmlFor="section-filter" className="text-sm font-medium text-slate-700">
            Section:
          </label>
          <select
            id="section-filter"
            value={selectedSection || ''}
            onChange={(e) => handleSectionChange(e.target.value)}
            disabled={sessionMode}
            className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="">All sections</option>
            {ALL_SECTIONS.map((section) => (
              <option key={section} value={section}>
                {section}
              </option>
            ))}
          </select>
        </div>

        {sessionMode ? (
          <div className="flex items-center gap-4">
            <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
              Session Mode
            </span>
            <button
              onClick={handleExitSession}
              className="text-sm text-slate-600 hover:text-slate-800 underline"
            >
              Exit Session
            </button>
          </div>
        ) : (
          <button
            onClick={handleStartSession}
            disabled={startingSession}
            className="px-4 py-2 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            {startingSession ? 'Starting...' : 'Start Session (20 Q)'}
          </button>
        )}
      </div>

      {/* Progress indicator */}
      <div className="flex items-center justify-between text-sm text-slate-600">
        <span className="bg-slate-200 px-3 py-1 rounded-full">
          {currentQuestion.section}
        </span>
        <span className="font-medium">
          {currentIndex + 1} / {questions.length}
        </span>
      </div>

      {/* Question card */}
      <div className="bg-white rounded-xl shadow-md p-6">
        <div className="mb-6">
          <span className="text-sm text-slate-500 mb-2 block">
            Question {currentQuestion.number}
          </span>
          <h2 className="text-xl font-semibold text-slate-800">
            {currentQuestion.text}
          </h2>
        </div>

        {/* Hint (shown when enabled and not yet answered) */}
        {isHydrated && hintsEnabled && currentQuestion.hint && selectedAnswer === null && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-start gap-2">
              <span className="text-amber-600 text-lg">&#128161;</span>
              <div>
                <span className="text-sm font-medium text-amber-800">Hint:</span>
                <p className="text-amber-700 mt-1">{currentQuestion.hint}</p>
              </div>
            </div>
          </div>
        )}

        {/* Answers */}
        <div className="space-y-3">
          {currentQuestion.answers.map((answer) => (
            <button
              key={answer.letter}
              onClick={() => handleAnswerClick(answer.letter)}
              disabled={selectedAnswer !== null}
              className={getAnswerButtonClass(answer.letter)}
            >
              <span className="font-semibold mr-2">{answer.letter}.</span>
              {answer.text}
            </button>
          ))}
        </div>

        {/* Result feedback */}
        {attemptResult && (
          <div
            className={`mt-6 p-4 rounded-lg ${
              attemptResult.isCorrect
                ? 'bg-green-100 text-green-800'
                : 'bg-red-100 text-red-800'
            }`}
          >
            <p className="font-medium">
              {attemptResult.isCorrect
                ? 'Correct!'
                : `Incorrect. The correct answer is ${attemptResult.correctAnswer}.`}
            </p>

            {/* Explanation (always shown after answering) */}
            {currentQuestion.explanation && (
              <div className={`mt-3 pt-3 border-t ${
                attemptResult.isCorrect
                  ? 'border-green-200'
                  : 'border-red-200'
              }`}>
                <span className="font-medium">Explanation:</span>
                <p className="mt-1">{currentQuestion.explanation}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        {!sessionMode && (
          <button
            onClick={handlePreviousQuestion}
            disabled={currentIndex === 0}
            className="px-6 py-2 rounded-lg bg-slate-200 text-slate-700 font-medium hover:bg-slate-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
        )}

        {sessionMode && <div />}

        {selectedAnswer !== null && currentIndex < questions.length - 1 && (
          <button
            onClick={handleNextQuestion}
            className="px-6 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
          >
            Next
          </button>
        )}

        {selectedAnswer !== null && currentIndex === questions.length - 1 && (
          sessionMode ? (
            <button
              onClick={handleNextQuestion}
              className="px-6 py-2 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 transition-colors"
            >
              Finish Session
            </button>
          ) : (
            <div className="text-slate-600 font-medium py-2">
              You've reached the last question!
            </div>
          )
        )}
      </div>
    </div>
  );
}

function StudyLoading() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="text-slate-600">Loading...</div>
    </div>
  );
}

export default function StudyPage() {
  return (
    <Suspense fallback={<StudyLoading />}>
      <StudyContent />
    </Suspense>
  );
}
