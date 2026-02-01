import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { ProgressData, GeneratedHints, HintExplanation } from './providers/types';

const DATA_DIR = path.join(process.cwd(), 'data');
const PROGRESS_FILE = path.join(DATA_DIR, 'hints-progress.json');
const PARTIAL_FILE = path.join(DATA_DIR, 'hints-partial.json');

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

// Atomic write: write to temp file then rename
function atomicWriteJson(filePath: string, data: unknown): void {
  const tempFile = path.join(os.tmpdir(), `temp-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tempFile, filePath);
}

export function loadProgress(): ProgressData {
  ensureDataDir();

  if (fs.existsSync(PROGRESS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
    } catch {
      console.warn('Failed to load progress file, starting fresh');
    }
  }

  return {
    completedIds: [],
    failedIds: [],
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    totalQuestions: 0,
    stats: {
      avgHintLength: 0,
      avgExplanationLength: 0,
      successRate: 0,
    },
  };
}

export function saveProgress(progress: ProgressData): void {
  ensureDataDir();
  progress.updatedAt = new Date().toISOString();

  // Calculate stats
  if (progress.completedIds.length > 0) {
    const total = progress.completedIds.length + progress.failedIds.length;
    progress.stats.successRate = progress.completedIds.length / total;
  }

  atomicWriteJson(PROGRESS_FILE, progress);
}

export function loadPartialHints(): GeneratedHints {
  ensureDataDir();

  if (fs.existsSync(PARTIAL_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(PARTIAL_FILE, 'utf-8'));
    } catch {
      console.warn('Failed to load partial hints, starting fresh');
    }
  }

  return {};
}

export function savePartialHints(hints: GeneratedHints): void {
  ensureDataDir();
  atomicWriteJson(PARTIAL_FILE, hints);
}

export function addHintsToPartial(
  hints: GeneratedHints,
  newHints: HintExplanation[]
): { hints: GeneratedHints; avgHintLen: number; avgExplLen: number } {
  let totalHintLen = 0;
  let totalExplLen = 0;

  for (const h of newHints) {
    hints[h.id] = {
      hint: h.hint,
      explanation: h.explanation,
    };
    totalHintLen += h.hint.length;
    totalExplLen += h.explanation.length;
  }

  return {
    hints,
    avgHintLen: newHints.length > 0 ? totalHintLen / newHints.length : 0,
    avgExplLen: newHints.length > 0 ? totalExplLen / newHints.length : 0,
  };
}

export function getProgressSummary(progress: ProgressData): string {
  const completed = progress.completedIds.length;
  const failed = progress.failedIds.length;
  const total = progress.totalQuestions;
  const remaining = total - completed - failed;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return `Progress: ${completed}/${total} (${percent}%) | Failed: ${failed} | Remaining: ${remaining}`;
}
