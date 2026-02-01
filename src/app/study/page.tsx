'use client';

import { Suspense, useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import type { Question, Section } from '@/types/questions';

interface AttemptResponse {
  id: number;
  isCorrect: boolean;
  correctAnswer: string;
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

  const [allQuestions, setAllQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [attemptResult, setAttemptResult] = useState<AttemptResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get selected section from URL params
  const selectedSection = searchParams.get('section') as Section | null;

  // Filter questions by section
  const questions = useMemo(() => {
    if (!selectedSection) {
      return allQuestions;
    }
    return allQuestions.filter((q) => q.section === selectedSection);
  }, [allQuestions, selectedSection]);

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

  // Reset index when section changes
  useEffect(() => {
    setCurrentIndex(0);
    setSelectedAnswer(null);
    setAttemptResult(null);
  }, [selectedSection]);

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

  if (questions.length === 0) {
    return (
      <div className="space-y-6">
        {/* Section filter */}
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

        <div className="flex items-center justify-center py-12">
          <div className="text-slate-600">No questions available for this section</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Section filter */}
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
            {attemptResult.isCorrect
              ? 'Correct!'
              : `Incorrect. The correct answer is ${attemptResult.correctAnswer}.`}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          onClick={handlePreviousQuestion}
          disabled={currentIndex === 0}
          className="px-6 py-2 rounded-lg bg-slate-200 text-slate-700 font-medium hover:bg-slate-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Previous
        </button>

        {selectedAnswer !== null && currentIndex < questions.length - 1 && (
          <button
            onClick={handleNextQuestion}
            className="px-6 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
          >
            Next
          </button>
        )}

        {currentIndex === questions.length - 1 && selectedAnswer !== null && (
          <div className="text-slate-600 font-medium py-2">
            You've reached the last question!
          </div>
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
