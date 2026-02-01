/**
 * Types for database records
 */

/** A study session record */
export interface Session {
  id: number;
  created_at: string;
  completed_at: string | null;
}

/** A question attempt record */
export interface Attempt {
  id: number;
  question_id: string;
  session_id: number | null;
  selected_answer: string;
  is_correct: boolean;
  created_at: string;
}

/** Insert data for a new attempt */
export interface AttemptInsert {
  question_id: string;
  session_id?: number | null;
  selected_answer: string;
  is_correct: boolean;
}
