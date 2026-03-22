# Session ID Architecture

## Overview

VibeLearn uses **two distinct session IDs** to track conversations:

1. **`contentSessionId`** — The user's Claude Code conversation session ID (from the hook input)
2. **`memorySessionId`** — The SDK agent's internal session ID, captured after the first SDK run (enables resume)

## Why Two IDs?

The SDK agent creates its own internal session when it starts. VibeLearn needs to track both:
- **`contentSessionId`**: Links observations, stack profiles, concepts, and quiz questions to the user's session
- **`memorySessionId`**: Allows the SDK agent to resume from a previous memory session across turns

## Initialization Flow

```
┌──────────────────────────────────────────────┐
│ 1. Hook fires: UserPromptSubmit               │
│    POST /api/sessions/init                   │
│    { contentSessionId: "user-abc-123" }      │
│                                               │
│    Database state (sdk_sessions):            │
│    ├─ content_session_id: "user-abc-123"     │
│    └─ memory_session_id: NULL                │
└──────────────────────────────────────────────┘
                       ↓
┌──────────────────────────────────────────────┐
│ 2. SDKAgent starts (if configured)            │
│    Checks: hasRealMemorySessionId?            │
│    → FALSE (NULL) → fresh SDK session         │
│    Runs, captures memory_session_id           │
│    Writes memory_session_id back to DB        │
└──────────────────────────────────────────────┘
                       ↓
┌──────────────────────────────────────────────┐
│ 3. Next session with same user               │
│    memory_session_id is now set              │
│    → SDKAgent resumes from prior context     │
└──────────────────────────────────────────────┘
```

## Usage in Analysis Pipeline

The analysis pipeline uses `contentSessionId` as the primary key:

```
POST /api/vibelearn/analyze/stack    { contentSessionId }
POST /api/vibelearn/analyze/static   { contentSessionId }
POST /api/vibelearn/analyze/concepts { contentSessionId, last_assistant_message }
POST /api/vibelearn/analyze/quiz     { contentSessionId }
POST /api/vibelearn/sync             { contentSessionId }
```

Inside each handler, `contentSessionId` is resolved to `memorySessionId` to query observations from the `observations` table (which is keyed by memory session).

## Database Schema

```sql
-- sdk_sessions table
content_session_id TEXT NOT NULL UNIQUE
memory_session_id  TEXT             -- NULL until SDK agent runs

-- observations table
session_id TEXT NOT NULL  -- = memory_session_id
type TEXT                 -- file_edit, bash_command, mcp_tool, etc.
file_path TEXT
content TEXT
```

## Key Invariant

All vl_* tables (`vl_concepts`, `vl_questions`, `vl_stack_profiles`) are keyed by `content_session_id`. The mapping from content → memory session is resolved at analysis time via the `sdk_sessions` table.
