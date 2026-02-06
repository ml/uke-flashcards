'use client';

import { useState, useEffect, useMemo } from 'react';
import type { PhoneticLetter } from '@/types/alphabet';

interface LetterMultipleChoiceProps {
  letter: PhoneticLetter;
  allLetters: PhoneticLetter[];
  onAnswer: (isCorrect: boolean) => void;
  disabled?: boolean;
}

interface Option {
  phonetic: string;
  isCorrect: boolean;
}

export function LetterMultipleChoice({
  letter,
  allLetters,
  onAnswer,
  disabled = false,
}: LetterMultipleChoiceProps) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);

  // Reset state when letter changes
  useEffect(() => {
    setSelectedOption(null);
    setShowResult(false);
  }, [letter.id]);

  // Generate options with distractors
  const options = useMemo(() => {
    const correctOption: Option = {
      phonetic: letter.phonetic,
      isCorrect: true,
    };

    // Get other letters for distractors (excluding current)
    const otherLetters = allLetters.filter((l) => l.id !== letter.id);

    // Shuffle and take 3 distractors
    const shuffled = [...otherLetters].sort(() => Math.random() - 0.5);
    const distractors: Option[] = shuffled.slice(0, 3).map((l) => ({
      phonetic: l.phonetic,
      isCorrect: false,
    }));

    // Combine and shuffle all options
    const allOptions = [correctOption, ...distractors];
    return allOptions.sort(() => Math.random() - 0.5);
  }, [letter.id, letter.phonetic, allLetters]);

  function handleOptionClick(phonetic: string) {
    if (showResult || disabled) return;

    setSelectedOption(phonetic);
    setShowResult(true);

    const isCorrect = phonetic === letter.phonetic;

    // Delay before moving to next question
    setTimeout(() => {
      onAnswer(isCorrect);
    }, 1000);
  }

  function getOptionClassName(option: Option): string {
    const base = 'w-full p-4 rounded-lg border-2 text-left font-medium transition-all';

    if (!showResult) {
      return `${base} border-slate-200 bg-white hover:border-blue-400 hover:bg-blue-50 cursor-pointer`;
    }

    if (option.isCorrect) {
      return `${base} border-green-500 bg-green-50 text-green-700`;
    }

    if (selectedOption === option.phonetic && !option.isCorrect) {
      return `${base} border-red-500 bg-red-50 text-red-700`;
    }

    return `${base} border-slate-200 bg-white opacity-50`;
  }

  return (
    <div className="bg-white rounded-xl shadow-md p-8">
      {/* Letter display */}
      <div className="text-center mb-8">
        <div className="text-8xl font-bold text-blue-600 mb-4 font-mono">
          {letter.letter}
        </div>
        <p className="text-slate-500">Wybierz prawidłową wymowę fonetyczną:</p>
      </div>

      {/* Options */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {options.map((option, index) => (
          <button
            key={`${letter.id}-${index}-${option.phonetic}`}
            onClick={() => handleOptionClick(option.phonetic)}
            disabled={showResult || disabled}
            className={getOptionClassName(option)}
          >
            <span className="text-lg">{option.phonetic}</span>
            {showResult && option.isCorrect && (
              <span className="ml-2 text-green-600">✓</span>
            )}
            {showResult && selectedOption === option.phonetic && !option.isCorrect && (
              <span className="ml-2 text-red-600">✗</span>
            )}
          </button>
        ))}
      </div>

      {/* Result message */}
      {showResult && (
        <div className={`mt-6 p-4 rounded-lg text-center ${
          selectedOption === letter.phonetic
            ? 'bg-green-100 text-green-700'
            : 'bg-red-100 text-red-700'
        }`}>
          {selectedOption === letter.phonetic ? (
            <span className="font-medium">Dobrze! ✓</span>
          ) : (
            <span className="font-medium">
              Źle. Prawidłowa odpowiedź: <strong>{letter.phonetic}</strong>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
