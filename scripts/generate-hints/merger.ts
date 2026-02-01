import * as fs from 'fs';
import * as path from 'path';
import type { Question, QuestionBank } from '../../src/types/questions';
import type { GeneratedHints } from './providers/types';

const DATA_DIR = path.join(process.cwd(), 'data');
const QUESTIONS_FILE = path.join(DATA_DIR, 'questions.json');
const BACKUP_FILE = path.join(DATA_DIR, 'questions.backup.json');
const PARTIAL_FILE = path.join(DATA_DIR, 'hints-partial.json');

function loadQuestions(): QuestionBank {
  const content = fs.readFileSync(QUESTIONS_FILE, 'utf-8');
  return JSON.parse(content);
}

function loadPartialHints(): GeneratedHints {
  const content = fs.readFileSync(PARTIAL_FILE, 'utf-8');
  return JSON.parse(content);
}

function createBackup(): void {
  const content = fs.readFileSync(QUESTIONS_FILE, 'utf-8');
  fs.writeFileSync(BACKUP_FILE, content, 'utf-8');
  console.log(`Backup created at ${BACKUP_FILE}`);
}

function validateMerge(original: Question[], merged: Question[]): void {
  if (original.length !== merged.length) {
    throw new Error(`Question count mismatch: ${original.length} vs ${merged.length}`);
  }

  for (let i = 0; i < original.length; i++) {
    const orig = original[i];
    const merg = merged[i];

    // Verify no existing fields were changed
    if (orig.id !== merg.id) {
      throw new Error(`ID mismatch at index ${i}: ${orig.id} vs ${merg.id}`);
    }
    if (orig.text !== merg.text) {
      throw new Error(`Text changed for question ${orig.id}`);
    }
    if (orig.correctAnswerLetter !== merg.correctAnswerLetter) {
      throw new Error(`Correct answer changed for question ${orig.id}`);
    }
    if (orig.section !== merg.section) {
      throw new Error(`Section changed for question ${orig.id}`);
    }
    if (JSON.stringify(orig.answers) !== JSON.stringify(merg.answers)) {
      throw new Error(`Answers changed for question ${orig.id}`);
    }
  }
}

export function mergeHintsIntoQuestions(confirm: boolean): void {
  if (!confirm) {
    console.log('Dry run mode - no changes will be made');
    console.log('Use --confirm to actually merge the hints');
  }

  // Check files exist
  if (!fs.existsSync(PARTIAL_FILE)) {
    throw new Error(`Partial hints file not found: ${PARTIAL_FILE}`);
  }
  if (!fs.existsSync(QUESTIONS_FILE)) {
    throw new Error(`Questions file not found: ${QUESTIONS_FILE}`);
  }

  const questionBank = loadQuestions();
  const hints = loadPartialHints();

  console.log(`Loaded ${questionBank.questions.length} questions`);
  console.log(`Loaded hints for ${Object.keys(hints).length} questions`);

  // Count coverage
  let withHint = 0;
  let withoutHint = 0;

  const mergedQuestions = questionBank.questions.map((q) => {
    const hintData = hints[q.id];
    if (hintData) {
      withHint++;
      return {
        ...q,
        hint: hintData.hint,
        explanation: hintData.explanation,
      };
    } else {
      withoutHint++;
      return q;
    }
  });

  console.log(`Questions with hints: ${withHint}`);
  console.log(`Questions without hints: ${withoutHint}`);

  // Validate merge
  validateMerge(questionBank.questions, mergedQuestions);
  console.log('Validation passed - no existing fields were modified');

  if (confirm) {
    // Create backup
    createBackup();

    // Write merged file
    const mergedBank: QuestionBank = {
      ...questionBank,
      questions: mergedQuestions,
    };

    fs.writeFileSync(QUESTIONS_FILE, JSON.stringify(mergedBank, null, 2), 'utf-8');
    console.log(`Merged hints written to ${QUESTIONS_FILE}`);
  } else {
    console.log('\nDry run complete. Run with --confirm to apply changes.');
  }
}

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);
  const confirm = args.includes('--confirm');

  try {
    mergeHintsIntoQuestions(confirm);
  } catch (err) {
    console.error('Merge failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
