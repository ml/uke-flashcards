/**
 * Types for UKE amateur radio exam questions
 */

/** The four exam sections for the UKE amateur radio exam */
export type Section =
  | "Radiotechnika" // Radio Engineering
  | "Przepisy" // Regulations
  | "Bezpieczeństwo" // Safety
  | "Procedury operatorskie"; // Operating Procedures

/** A single answer option for a question */
export interface Answer {
  /** The answer letter (A, B, C, etc.) */
  letter: string;
  /** The answer text content */
  text: string;
}

/** A single exam question */
export interface Question {
  /** Unique question ID (typically the question number from the source) */
  id: string;
  /** The question number as displayed in the source */
  number: number;
  /** The question text */
  text: string;
  /** All available answer options */
  answers: Answer[];
  /** The letter of the correct answer (e.g., "A", "B", "C") */
  correctAnswerLetter: string;
  /** The exam section this question belongs to */
  section: Section;
  /** Hint to help answer (formulas, definitions, laws) - optional during migration */
  hint?: string;
  /** Explanation of why the correct answer is right - optional during migration */
  explanation?: string;
}

/** The complete question bank structure */
export interface QuestionBank {
  /** All questions in the bank */
  questions: Question[];
  /** Metadata about the fetch operation */
  metadata: {
    /** When the questions were fetched */
    fetchedAt: string;
    /** Source URL */
    source: string;
    /** Total number of questions */
    totalQuestions: number;
    /** Number of questions per section */
    questionsBySection: Record<Section, number>;
  };
}
