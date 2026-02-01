# PRD: UKE Flashcards App

## Introduction

A flashcards application to help users study for the UKE amateur radio exam (egzamin krótkofalarza). The app fetches questions from egzaminkf.pl, stores them locally, and provides an interactive study experience with spaced repetition. Users can study all questions or filter by section, with a dashboard tracking progress toward the 60% per-section passing threshold.

## Goals

- Fetch and parse all UKE exam questions from egzaminkf.pl (pages 1-21)
- Provide interactive flashcard-style studying with immediate feedback
- Implement spaced repetition to optimize memorization
- Track progress per question and per section
- Help users identify weak areas and reach 60% correctness per section

## User Stories

### US-001: Fetch questions from source website
**Description:** As a developer, I need to fetch all questions from the gated website so users have access to the complete question bank.

**Acceptance Criteria:**
- [ ] Script reads credentials from `.credentials` file (never committed to repo)
- [ ] Script authenticates to egzaminkf.pl/login.php
- [ ] Script fetches pages 1-21 from the question bank
- [ ] Script parses HTML to extract: question number, question text, all answers, correct answer, section
- [ ] Script saves parsed data as JSON to `data/questions.json`
- [ ] TypeScript types defined for Question, Answer, and Section
- [ ] Script handles errors gracefully (auth failure, network issues)
- [ ] Typecheck passes

### US-002: Initialize Next.js app with SQLite
**Description:** As a developer, I need the basic app structure so I can build features on top.

**Acceptance Criteria:**
- [ ] Next.js app created with App Router
- [ ] Tailwind CSS configured
- [ ] SQLite database initialized with schema for: questions, attempts, sessions
- [ ] Database stores: question_id, session_id, user_answer, is_correct, timestamp
- [ ] Questions loaded from JSON into memory on app start
- [ ] Typecheck passes

### US-003: Browse all questions sequentially
**Description:** As a user, I want to browse through all questions one by one so I can study the entire question bank.

**Acceptance Criteria:**
- [ ] Main study page shows one question at a time
- [ ] Question displays: number, text, section label, all answer options
- [ ] Clicking an answer reveals if it's correct (green) or wrong (red + show correct)
- [ ] "Next" button appears after answering to advance
- [ ] Progress indicator shows current position (e.g., "42 / 847")
- [ ] Attempt recorded in database on answer
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-004: Filter questions by section
**Description:** As a user, I want to study only questions from a specific section so I can focus on weak areas.

**Acceptance Criteria:**
- [ ] Section selector dropdown on study page
- [ ] Options: "All sections" + each of the 4 sections
- [ ] Selecting a section filters the question pool
- [ ] Progress indicator updates to reflect filtered count
- [ ] Selection persists in URL params
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-005: Start a 20-question session
**Description:** As a user, I want to do timed practice sessions of 20 questions so I can simulate exam conditions.

**Acceptance Criteria:**
- [ ] "Start Session" button on home/study page
- [ ] Session selects 20 questions using spaced repetition algorithm:
  - 10 questions user has answered least (prioritize never-seen)
  - 10 questions user got wrong (prioritize recent failures)
- [ ] Session respects current section filter
- [ ] Session progress shows "5 / 20" style indicator
- [ ] Session ends after 20 questions with summary
- [ ] Session summary shows: correct count, incorrect count, per-section breakdown
- [ ] All attempts recorded with session_id in database
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-006: Dashboard with statistics
**Description:** As a user, I want to see my progress and weak areas so I know what to focus on.

**Acceptance Criteria:**
- [ ] Dashboard page accessible from navigation
- [ ] Per-section statistics:
  - Total questions in section
  - Questions attempted
  - Correctness percentage
  - Visual indicator for 60% threshold (pass/fail status)
- [ ] Weak areas section:
  - List of questions with lowest correctness rate
  - Minimum 3 attempts to appear in weak areas
- [ ] Per-question drill-down available (click to see attempt history)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-007: Session history
**Description:** As a user, I want to see my past sessions so I can track improvement over time.

**Acceptance Criteria:**
- [ ] Session history list on dashboard
- [ ] Each session shows: date, questions correct/total, sections covered
- [ ] Sessions sorted by most recent first
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

## Functional Requirements

- FR-1: Data fetcher script reads credentials from `.credentials` file only (format: `email\npassword`)
- FR-2: Questions stored in `data/questions.json` with structure: `{ questions: Question[] }`
- FR-3: Question type includes: `id`, `number`, `text`, `answers[]`, `correctAnswerIndex`, `section`
- FR-4: SQLite database at `data/uke-flashcards.db`
- FR-5: Database schema tracks individual attempts with: `question_id`, `session_id` (nullable for free study), `selected_answer`, `is_correct`, `created_at`
- FR-6: Spaced repetition uses SM-2 inspired algorithm prioritizing:
  - Questions never seen (highest priority for "new" slots)
  - Questions answered incorrectly (weighted by recency and failure count)
  - Questions not seen recently (for review slots)
- FR-7: All API routes under `/api/*` in Next.js
- FR-8: No authentication required - single user assumed
- FR-9: Section filter persisted in URL search params

## Non-Goals

- No user authentication or multi-user support
- No timed pressure (no countdown timer during sessions)
- No question editing or admin interface
- No mobile app (web only)
- No offline support
- No spaced repetition scheduling (no "review tomorrow" notifications)
- No import/export of progress data

## Design Considerations

- Minimal, clean UI with Tailwind CSS
- Large, readable text for questions (study-focused)
- Clear visual feedback: green for correct, red for incorrect
- Section colors consistent throughout app
- Mobile-responsive but desktop-primary
- Simple navigation: Study | Dashboard

## Technical Considerations

- Next.js 14+ with App Router
- SQLite via `better-sqlite3` for simplicity
- Questions loaded from JSON at build/runtime (no DB storage for questions)
- Attempts and sessions stored in SQLite
- Single `data/` directory for both JSON and SQLite DB
- `.credentials` file must be in `.gitignore`
- Data fetcher script in `scripts/fetch-questions.ts`

## Success Metrics

- User can complete full study cycle of all 847 questions
- Dashboard shows clear progress toward 60% per section
- Session algorithm surfaces weak questions effectively
- App loads and responds quickly (no perceived lag)

## Open Questions

- Should there be a "mark for review" feature to flag confusing questions?
- Should sessions allow early exit with partial progress saved?
- Should the app show explanations for answers (if available in source)?

---

## Implementation Phases

### Phase 1: Data Fetching
- US-001: Fetch and parse questions

### Phase 2: Core App Setup
- US-002: Initialize Next.js with SQLite

### Phase 3: Basic Study Flow
- US-003: Browse all questions
- US-004: Filter by section

### Phase 4: Sessions
- US-005: 20-question sessions with spaced repetition

### Phase 5: Dashboard
- US-006: Statistics dashboard
- US-007: Session history
