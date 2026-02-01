# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

UKE Flashcards is a Next.js application for studying Polish amateur radio exam (egzamin krótkofalarza) questions. Questions are fetched from egzaminkf.pl and stored locally, with SQLite tracking user progress.

## Commands

```bash
npm run dev          # Start development server (port 3000)
npm run build        # Production build
npm run typecheck    # TypeScript type checking (run before commits)
npm run lint         # ESLint
npm run fetch-questions  # Fetch questions from egzaminkf.pl (requires .credentials)
```

## Architecture

### Data Flow
- **Questions**: Loaded from `data/questions.json` into memory via `src/lib/questions.ts`
- **Attempts/Sessions**: Stored in SQLite at `data/uke-flashcards.db` via `src/lib/db.ts`
- Questions are static (JSON), user progress is dynamic (SQLite)

### Directory Structure
```
src/
├── app/                 # Next.js App Router pages and API routes
│   ├── api/            # REST endpoints
│   │   ├── attempts/   # POST attempt records
│   │   ├── questions/  # GET questions
│   │   ├── sessions/   # POST/PATCH session management
│   │   └── stats/      # GET statistics
│   ├── study/          # Main study interface
│   └── dashboard/      # Progress tracking
├── lib/
│   ├── db.ts           # SQLite connection + schema initialization
│   └── questions.ts    # Question loading from JSON
└── types/
    ├── questions.ts    # Question, Answer, Section, QuestionBank
    └── database.ts     # Session, Attempt, AttemptInsert
scripts/
└── fetch-questions.ts  # Question scraper (runs with tsx)
data/
├── questions.json      # Question bank
└── uke-flashcards.db   # SQLite database (gitignored)
```

### Key Types

**Section** (4 exam sections):
- `"Radiotechnika"` - Radio Engineering
- `"Przepisy"` - Regulations
- `"Bezpieczeństwo"` - Safety
- `"Procedury operatorskie"` - Operating Procedures

**Question**: `{ id, number, text, answers[], correctAnswerLetter, section }`

### Session Algorithm
Sessions select 20 questions using spaced repetition:
- 10 questions: least answered (prioritize never-seen)
- 10 questions: wrong answers (prioritize recent failures)

## Path Alias

Use `@/*` for imports from `src/`:
```typescript
import { getDb } from '@/lib/db';
import type { Question } from '@/types/questions';
```

## Credentials

The question fetcher requires `.credentials` file (gitignored):
```
email: your@email.com
password: yourpassword
```
