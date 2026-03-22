# VibeLearn ↔ Cursor Integration Architecture

## Overview

This integration connects Cursor's hook system to VibeLearn's analysis pipeline. When you code in Cursor, file edits and tool usage are captured as observations. When the agent stops, VibeLearn runs a 5-step analysis pipeline to extract learning concepts and generate quiz questions.

## Architecture

```
┌─────────────────────────────────────┐
│   Cursor Agent Session              │
│   (MCP tools, shell, file edits)    │
└──────┬──────────────────────────────┘
       │
       │ Cursor Hook Events
       │
       ▼
┌─────────────────────────────────────┐
│   Hook Scripts (Bash / PowerShell)  │
│  ┌────────────────────────────────┐ │
│  │ session-init.sh               │ │  ← beforeSubmitPrompt
│  │ save-observation.sh           │ │  ← afterMCPExecution / afterShellExecution
│  │ save-file-edit.sh             │ │  ← afterFileEdit
│  │ session-summary.sh            │ │  ← stop
│  └────────────────────────────────┘ │
└──────┬──────────────────────────────┘
       │
       │ HTTP API (localhost:37778)
       │
       ▼
┌─────────────────────────────────────┐
│   VibeLearn Worker Service          │
│   (Port 37778)                      │
│  ┌────────────────────────────────┐ │
│  │ /api/sessions/init            │ │
│  │ /api/sessions/observations    │ │
│  │ /api/sessions/summarize       │ │
│  │ /api/vibelearn/analyze/stack  │ │
│  │ /api/vibelearn/analyze/static │ │
│  │ /api/vibelearn/analyze/concepts│ │
│  │ /api/vibelearn/analyze/quiz   │ │
│  │ /api/vibelearn/sync           │ │
│  └────────────────────────────────┘ │
└──────┬──────────────────────────────┘
       │
       │ Database Operations
       │
       ▼
┌─────────────────────────────────────┐
│   SQLite Database                   │
│   ~/.vibelearn/vibelearn.db         │
│                                     │
│   vl_concepts, vl_questions,        │
│   vl_stack_profiles, vl_sync_queue  │
└─────────────────────────────────────┘
```

## Event Flow

### 1. Prompt Submission

```
User submits prompt in Cursor
    ↓
beforeSubmitPrompt hook → session-init.sh
    ├─ Extract conversation_id, workspace root
    ├─ POST /api/sessions/init
    └─ {"continue": true} → prompt proceeds
```

### 2. Tool / File Capture

```
Agent executes MCP tool or shell command
    ↓
afterMCPExecution / afterShellExecution → save-observation.sh
    ├─ Extract tool_name, tool_input, result
    ├─ POST /api/sessions/observations
    └─ Stored in observations table (fire-and-forget)

Agent edits a file
    ↓
afterFileEdit → save-file-edit.sh
    ├─ Extract file_path, edit content
    ├─ POST /api/sessions/observations (type: file_edit)
    └─ File content included (truncated at 10KB)
```

### 3. Session End — Analysis Pipeline

```
Agent loop ends
    ↓
stop hook → session-summary.sh
    ↓
POST /api/vibelearn/analyze/stack
    └─ Reads package.json / config files → vl_stack_profiles
    ↓
POST /api/vibelearn/analyze/static
    └─ Pattern analysis on modified files
    ↓
POST /api/vibelearn/analyze/concepts
    └─ LLM call: session summary + concept list → vl_concepts
    ↓
POST /api/vibelearn/analyze/quiz
    └─ LLM call: quiz questions per concept → vl_questions
    ↓
POST /api/vibelearn/sync
    └─ HMAC-signed POST to api.vibelearn.dev (queued offline if unavailable)
```

## Data Mapping

### Session ID

| Cursor Field | VibeLearn Field | Notes |
|-------------|------------------|-------|
| `conversation_id` | `contentSessionId` | Stable across turns |
| `generation_id` | (fallback) | Used if conversation_id unavailable |

### Tool / Observation Mapping

| Cursor Event | VibeLearn Type | Content |
|-------------|----------------|---------|
| `afterMCPExecution` | `mcp_tool` | tool_name, tool_input, result |
| `afterShellExecution` | `bash_command` | command, output |
| `afterFileEdit` | `file_edit` | file_path, edit content |

### Project

| Source | Target |
|--------|--------|
| `workspace_roots[0]` basename | Project name in session |

## API Endpoints Used

### Session Lifecycle
- `POST /api/sessions/init` — Initialize session
- `POST /api/sessions/observations` — Store observation

### Analysis Pipeline (called sequentially on session end)
- `POST /api/vibelearn/analyze/stack` — Tech stack detection
- `POST /api/vibelearn/analyze/static` — Static pattern analysis
- `POST /api/vibelearn/analyze/concepts` — LLM concept extraction
- `POST /api/vibelearn/analyze/quiz` — LLM quiz generation
- `POST /api/vibelearn/sync` — Upstream sync

### System
- `GET /api/readiness` — Worker ready check
- `GET /api/health` — Health check

## Error Handling

### Worker Unavailable
- Hooks poll `/api/readiness` with retries (up to 6 seconds)
- If worker unavailable, hooks exit 0 — session not blocked
- All HTTP requests use `curl -s` (silent mode)

### Analysis Failures
- Each pipeline step is independent — a failed step doesn't block subsequent ones
- Errors are logged to `~/.vibelearn/logs/vibelearn-YYYY-MM-DD.log`
- Sync failures are queued in `vl_sync_queue` and retried next session

### Missing Data
- Empty `conversation_id` → use `generation_id`
- Empty `workspace_root` → use `pwd`
- Missing file content → file skipped in static analysis

## Testing

### Manual Hook Testing

```bash
# Test session initialization
echo '{"conversation_id":"test-123","workspace_roots":["/tmp/test"],"prompt":"test"}' | \
  ~/.cursor/hooks/session-init.sh

# Test observation capture
echo '{"conversation_id":"test-123","hook_event_name":"afterMCPExecution","tool_name":"read_file","tool_input":{"path":"/tmp/test.ts"},"result_json":{}}' | \
  ~/.cursor/hooks/save-observation.sh

# Test worker health
curl http://127.0.0.1:37778/api/health | jq .
curl http://127.0.0.1:37778/api/readiness
```

### Verify Analysis Ran

After a session with TypeScript edits:
```bash
vl status      # Shows session count and concept categories
vl quiz        # Presents questions from the session
```

## Comparison: Cursor vs Claude Code

| Feature | Claude Code | Cursor |
|---------|-------------|--------|
| Session Init | ✅ `SessionStart` hook | ✅ `beforeSubmitPrompt` hook |
| File Edit Capture | ✅ `PostToolUse` (Write/Edit tools) | ✅ `afterFileEdit` hook |
| Bash Capture | ✅ `PostToolUse` (Bash tool) | ✅ `afterShellExecution` hook |
| Analysis Pipeline | ✅ `Stop` hook triggers all 5 steps | ✅ `stop` hook triggers all 5 steps |
| Transcript Access | ✅ Full transcript path available | ⚠️ Not available (no last_assistant_message) |
| Concept Extraction | ✅ With transcript context | ✅ File-edit content only |

## Troubleshooting

See [README.md](README.md#troubleshooting) for detailed troubleshooting steps.
