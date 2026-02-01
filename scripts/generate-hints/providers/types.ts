import type { Question } from '../../../src/types/questions';

export interface HintExplanation {
  id: string;
  hint: string;
  explanation: string;
}

export interface BatchResult {
  successful: HintExplanation[];
  failed: string[];
}

export interface LLMProvider {
  name: string;
  batchSize: number;
  generateBatch(questions: Question[]): Promise<BatchResult>;
}

export interface ProgressData {
  completedIds: string[];
  failedIds: string[];
  startedAt: string;
  updatedAt: string;
  totalQuestions: number;
  stats: {
    avgHintLength: number;
    avgExplanationLength: number;
    successRate: number;
  };
}

export interface GeneratedHints {
  [questionId: string]: {
    hint: string;
    explanation: string;
  };
}
