import * as fs from 'fs';
import * as path from 'path';
import type { Question, QuestionBank } from '../../src/types/questions';
import type { LLMProvider, HintExplanation } from './providers/types';
import { geminiCliProvider, checkGeminiInstalled } from './providers/gemini-cli';
import {
  loadProgress,
  saveProgress,
  loadPartialHints,
  savePartialHints,
  addHintsToPartial,
  getProgressSummary,
} from './progress';

// CLI argument parsing
interface Args {
  dryRun: boolean;
  resume: boolean;
  parallel: number;
  review: boolean;
  batchSize?: number;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run'),
    resume: args.includes('--resume'),
    parallel: parseInt(args.find((a) => a.startsWith('--parallel='))?.split('=')[1] || '4'),
    review: args.includes('--review'),
    batchSize: args.find((a) => a.startsWith('--batch='))
      ? parseInt(args.find((a) => a.startsWith('--batch='))!.split('=')[1])
      : undefined,
  };
}

function loadQuestions(): Question[] {
  const questionsPath = path.join(process.cwd(), 'data', 'questions.json');
  const content = fs.readFileSync(questionsPath, 'utf-8');
  const bank: QuestionBank = JSON.parse(content);
  return bank.questions;
}

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processBatchWithRetry(
  provider: LLMProvider,
  questions: Question[],
  maxRetries: number = 3
): Promise<{ successful: HintExplanation[]; failed: string[] }> {
  let attempts = 0;
  let lastResult = { successful: [] as HintExplanation[], failed: questions.map((q) => q.id) };

  while (attempts < maxRetries && lastResult.failed.length > 0) {
    attempts++;

    // Get questions that still need processing
    const toProcess = questions.filter((q) => lastResult.failed.includes(q.id));

    if (attempts > 1) {
      console.log(`  Retry attempt ${attempts} for ${toProcess.length} questions...`);
      await delay(2000 * attempts); // Exponential backoff
    }

    const result = await provider.generateBatch(toProcess);

    // Merge with previous successful results
    lastResult = {
      successful: [...lastResult.successful, ...result.successful],
      failed: result.failed,
    };
  }

  return lastResult;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const provider = geminiCliProvider;

  console.log('=== UKE Flashcards Hint Generator ===\n');

  // Check Gemini CLI is installed
  console.log('Checking Gemini CLI...');
  const geminiInstalled = await checkGeminiInstalled();
  if (!geminiInstalled) {
    console.error('Error: Gemini CLI is not installed or not authenticated.');
    console.error('Install: npm install -g @anthropic-ai/claude-cli');
    console.error('Or visit: https://ai.google.dev/gemini-api/docs/quickstart');
    process.exit(1);
  }
  console.log('Gemini CLI found!\n');

  // Load questions
  const allQuestions = loadQuestions();
  console.log(`Loaded ${allQuestions.length} questions\n`);

  // Load or initialize progress
  const progress = args.resume ? loadProgress() : {
    completedIds: [],
    failedIds: [],
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    totalQuestions: allQuestions.length,
    stats: { avgHintLength: 0, avgExplanationLength: 0, successRate: 0 },
  };

  progress.totalQuestions = allQuestions.length;

  // Load partial hints
  const hints = args.resume ? loadPartialHints() : {};

  // Filter out already completed questions
  const completedSet = new Set(progress.completedIds);
  const questionsToProcess = allQuestions.filter((q) => !completedSet.has(q.id));

  if (questionsToProcess.length === 0) {
    console.log('All questions have been processed!');
    console.log(getProgressSummary(progress));
    return;
  }

  console.log(`Questions to process: ${questionsToProcess.length}`);
  console.log(`Already completed: ${progress.completedIds.length}`);
  console.log(`Parallelism: ${args.parallel}`);
  console.log(`Batch size: ${provider.batchSize}\n`);

  // Dry run: only process 1 batch
  const questionsForRun = args.dryRun
    ? questionsToProcess.slice(0, provider.batchSize)
    : questionsToProcess;

  if (args.dryRun) {
    console.log(`DRY RUN: Processing only ${questionsForRun.length} questions\n`);
  }

  // Split into batches
  const batches = chunkArray(questionsForRun, provider.batchSize);
  console.log(`Total batches: ${batches.length}\n`);

  // Process batches in parallel rounds
  const parallelChunks = chunkArray(batches, args.parallel);
  let processedCount = 0;
  const startTime = Date.now();

  for (let roundIndex = 0; roundIndex < parallelChunks.length; roundIndex++) {
    const round = parallelChunks[roundIndex];
    console.log(`\n--- Round ${roundIndex + 1}/${parallelChunks.length} (${round.length} batches in parallel) ---`);

    // Process this round's batches in parallel
    const roundPromises = round.map(async (batch, batchIndex) => {
      const batchNum = roundIndex * args.parallel + batchIndex + 1;
      const totalBatches = batches.length;
      console.log(`[Batch ${batchNum}/${totalBatches}] Processing ${batch.length} questions...`);

      const result = await processBatchWithRetry(provider, batch);

      console.log(`[Batch ${batchNum}/${totalBatches}] Done: ${result.successful.length} successful, ${result.failed.length} failed`);

      return result;
    });

    const roundResults = await Promise.all(roundPromises);

    // Aggregate results from this round
    for (const result of roundResults) {
      // Add successful hints
      const { hints: updatedHints, avgHintLen, avgExplLen } = addHintsToPartial(hints, result.successful);
      Object.assign(hints, updatedHints);

      // Update progress
      for (const h of result.successful) {
        if (!progress.completedIds.includes(h.id)) {
          progress.completedIds.push(h.id);
        }
      }
      for (const id of result.failed) {
        if (!progress.failedIds.includes(id)) {
          progress.failedIds.push(id);
        }
      }

      // Update stats
      if (result.successful.length > 0) {
        const totalCompleted = progress.completedIds.length;
        progress.stats.avgHintLength =
          ((progress.stats.avgHintLength * (totalCompleted - result.successful.length)) +
            (avgHintLen * result.successful.length)) / totalCompleted;
        progress.stats.avgExplanationLength =
          ((progress.stats.avgExplanationLength * (totalCompleted - result.successful.length)) +
            (avgExplLen * result.successful.length)) / totalCompleted;
      }

      processedCount += result.successful.length + result.failed.length;
    }

    // Save progress after each round
    saveProgress(progress);
    savePartialHints(hints);

    // Print progress
    const elapsed = (Date.now() - startTime) / 1000;
    const questionsPerSec = processedCount / elapsed;
    const remaining = questionsForRun.length - processedCount;
    const eta = remaining / questionsPerSec;

    console.log(`\n${getProgressSummary(progress)}`);
    console.log(`Avg hint length: ${Math.round(progress.stats.avgHintLength)} chars`);
    console.log(`Avg explanation length: ${Math.round(progress.stats.avgExplanationLength)} chars`);
    console.log(`Speed: ${questionsPerSec.toFixed(1)} questions/sec | ETA: ${Math.round(eta)} seconds`);

    // Small delay between rounds to avoid rate limiting
    if (roundIndex < parallelChunks.length - 1) {
      await delay(1000);
    }
  }

  console.log('\n=== Generation Complete ===');
  console.log(getProgressSummary(progress));

  if (progress.failedIds.length > 0) {
    console.log(`\nFailed questions: ${progress.failedIds.join(', ')}`);
    console.log('Run with --resume to retry failed questions');
  }

  if (args.dryRun) {
    console.log('\nDry run output (first few hints):');
    const sample = Object.entries(hints).slice(0, 3);
    for (const [id, data] of sample) {
      console.log(`\n${id}:`);
      console.log(`  Hint: ${data.hint.substring(0, 100)}...`);
      console.log(`  Explanation: ${data.explanation.substring(0, 100)}...`);
    }
  } else {
    console.log(`\nHints saved to data/hints-partial.json`);
    console.log('Run "npm run generate-hints:merge" to merge into questions.json');
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
