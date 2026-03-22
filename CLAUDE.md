# VibeLearn Plugin — AI Development Instructions

VibeLearn is a Claude Code plugin that analyzes coding sessions to extract learning concepts and generate quiz questions. It captures what developers build during sessions, runs local analysis, and syncs structured learning data to VibeLearn.dev.

## Architecture

**5 Lifecycle Hooks**: SessionStart → UserPromptSubmit → PostToolUse → Summary → SessionEnd

**Hooks** (`src/hooks/*.ts`) - TypeScript → ESM, built to `plugin/scripts/*-hook.js`

**Worker Service** (`src/services/worker-service.ts`) - Express API on port **37778**, Bun-managed, handles analysis pipeline asynchronously

**Database** (`src/services/sqlite/`) - SQLite3 at `~/.vibelearn/vibelearn.db`

**Analysis Pipeline** (`src/services/analysis/`) - Runs after each session:
1. `StackDetector.ts` — reads package.json/config files, detects framework/ORM/stack
2. `StaticAnalyzer.ts` — AST parses Write/Edit observations for code patterns (tree-sitter)
3. `ConceptExtractor.ts` — single LLM call: produces session summary + extracted concepts
4. `QuizGenerator.ts` — second LLM call: generates quiz questions per concept

**Upstream Sync** (`src/services/sync/`) - Sends session analysis to VibeLearn.dev:
- `UpstreamSync.ts` — HMAC-signed POST to `https://api.vibelearn.dev/v1/sync`
- `OfflineQueue.ts` — queues payloads when offline, flushes on next successful sync

**CLI** (`src/cli/vl/`) - `vl quiz`, `vl status`, `vl gaps`, `vl login`

## Privacy Tags
- `<private>content</private>` - User-level privacy control (prevents storage and sync)

**Implementation**: Tag stripping at hook layer before data reaches worker/database. See `src/utils/tag-stripping.ts`.

## Build Commands

```bash
npm run build-and-sync        # Build, sync to marketplace, restart worker
```

## Configuration

Settings in `~/.vibelearn/settings.json` (auto-created with defaults on first run).
API key and sync config in `~/.vibelearn/config.json` (written by `vl login <api-key>`).

## File Locations

- **Source**: `<project-root>/src/`
- **Built Plugin**: `<project-root>/plugin/`
- **Installed Plugin**: `~/.claude/plugins/marketplaces/vibelearn/`
- **Database**: `~/.vibelearn/vibelearn.db`
- **Settings**: `~/.vibelearn/settings.json`
- **Auth Config**: `~/.vibelearn/config.json`

## Exit Code Strategy

VibeLearn hooks use specific exit codes per Claude Code's hook contract:

- **Exit 0**: Success or graceful shutdown (Windows Terminal closes tabs)
- **Exit 1**: Non-blocking error (stderr shown to user, continues)
- **Exit 2**: Blocking error (stderr fed to Claude for processing)

**Philosophy**: Worker/hook errors exit with code 0 to prevent Windows Terminal tab accumulation. The wrapper/plugin layer handles restart logic. ERROR-level logging is maintained for diagnostics.

## Data Integrity

Quiz attempt data is HMAC-signed with the user's API key before syncing. The server is the source of truth — local SQLite is a cache/queue only. Streak is computed server-side from accepted attempt records, never from local `vl_daily_streaks`.

## Requirements

- **Bun** (all platforms — auto-installed if missing)
- **uv** (auto-installed if missing, provides Python for optional tooling)
- Node.js

## New Tables (Migration 008)

All VibeLearn-specific tables use the `vl_` prefix:
- `vibelearn_session_summaries` — human-readable session narratives
- `vl_concepts` — extracted concepts per session
- `vl_questions` — generated quiz questions
- `vl_quiz_attempts` — developer quiz answers
- `vl_developer_profile` — mastery tracking per concept
- `vl_daily_streaks` — streak cache (server is authoritative)
- `vl_sync_queue` — offline sync queue
- `vl_stack_profiles` — detected tech stack per session

## Important

No need to edit the changelog ever, it's generated automatically.
