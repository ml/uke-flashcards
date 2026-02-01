import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { Question } from '../../../src/types/questions';
import type { LLMProvider, BatchResult, HintExplanation } from './types';
import { buildBatchPrompt } from '../prompt';

const BATCH_SIZE = 25;
const TIMEOUT_MS = 120000; // 2 minutes per batch

export async function checkGeminiInstalled(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('gemini', ['--version'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
    });

    proc.on('close', (code) => {
      resolve(code === 0);
    });

    proc.on('error', () => {
      resolve(false);
    });

    setTimeout(() => {
      proc.kill();
      resolve(false);
    }, 5000);
  });
}

function normalizeId(id: string): string {
  // Handle variations like "Q1", "Q-1", "1", etc.
  const match = id.match(/\d+/);
  return match ? `Q${match[0]}` : id;
}

function parseGeminiResponse(output: string, expectedIds: string[]): BatchResult {
  const successful: HintExplanation[] = [];
  const failed: string[] = [];
  const foundIds = new Set<string>();

  try {
    // Strip markdown code fences if present
    let jsonStr = output;

    // Remove ```json or ``` markers
    jsonStr = jsonStr.replace(/```json\s*/g, '').replace(/```\s*/g, '');

    // Find JSON array in the output
    const jsonMatch = jsonStr.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error('No JSON array found in response');
      return { successful: [], failed: expectedIds };
    }

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      id: string;
      hint: string;
      explanation: string;
    }>;

    for (const item of parsed) {
      const normalizedId = normalizeId(item.id);

      if (!item.hint || typeof item.hint !== 'string' || item.hint.length < 10) {
        console.warn(`Invalid hint for ${normalizedId}`);
        continue;
      }

      if (!item.explanation || typeof item.explanation !== 'string' || item.explanation.length < 20) {
        console.warn(`Invalid explanation for ${normalizedId}`);
        continue;
      }

      successful.push({
        id: normalizedId,
        hint: item.hint.trim(),
        explanation: item.explanation.trim(),
      });
      foundIds.add(normalizedId);
    }
  } catch (err) {
    console.error('Failed to parse JSON response:', err);
  }

  // Find missing IDs
  for (const id of expectedIds) {
    const normalizedId = normalizeId(id);
    if (!foundIds.has(normalizedId)) {
      failed.push(normalizedId);
    }
  }

  return { successful, failed };
}

async function runGeminiCli(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // Write prompt to temp file to avoid shell escaping issues
    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `gemini-prompt-${Date.now()}.txt`);
    fs.writeFileSync(tempFile, prompt, 'utf-8');

    const proc = spawn('gemini', [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    // Pipe the prompt file to stdin
    const promptStream = fs.createReadStream(tempFile);
    promptStream.pipe(proc.stdin);

    const timeout = setTimeout(() => {
      proc.kill('SIGTERM');
      fs.unlinkSync(tempFile);
      reject(new Error('Gemini CLI timeout'));
    }, TIMEOUT_MS);

    proc.on('close', (code) => {
      clearTimeout(timeout);
      fs.unlinkSync(tempFile);

      if (code !== 0) {
        reject(new Error(`Gemini CLI exited with code ${code}: ${stderr}`));
      } else {
        resolve(stdout);
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      try {
        fs.unlinkSync(tempFile);
      } catch {
        // Ignore cleanup errors
      }
      reject(err);
    });
  });
}

export const geminiCliProvider: LLMProvider = {
  name: 'gemini-cli',
  batchSize: BATCH_SIZE,

  async generateBatch(questions: Question[]): Promise<BatchResult> {
    const prompt = buildBatchPrompt(questions);
    const expectedIds = questions.map((q) => q.id);

    try {
      const output = await runGeminiCli(prompt);
      return parseGeminiResponse(output, expectedIds);
    } catch (err) {
      console.error('Gemini CLI error:', err);
      return { successful: [], failed: expectedIds };
    }
  },
};
