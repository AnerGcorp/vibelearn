# VibeLearn Cursor Hooks Integration

> **Learn from every Cursor session — automatically**

VibeLearn captures what you build in Cursor, runs a local analysis pipeline when each session ends, and generates quiz questions from the concepts you encountered. Run `vl quiz` to actually retain what you learn.

---

## What This Does

Every time a Cursor agent session ends, VibeLearn automatically:

1. **Detects your tech stack** — reads `package.json`, `pyproject.toml`, `go.mod`, etc.
2. **Analyzes your code changes** — identifies patterns in files you edited
3. **Extracts learning concepts** — a single LLM call produces a session summary + concept list
4. **Generates quiz questions** — a second LLM call creates targeted quiz questions per concept

Then run `vl quiz` to review what you learned.

---

## Quick Install

```bash
# Clone and build
git clone https://github.com/anergcorp/vibelearn.git
cd vibelearn && bun install && bun run build

# Interactive setup (configures provider + installs hooks)
bun run cursor:setup
```

---

## Installation

### Recommended (All Projects)

```bash
bun run cursor:install -- user
```

### Current Project Only

```bash
bun run cursor:install
```

### After Installation

1. **Start the worker**:
   ```bash
   bun run worker:start
   ```

2. **Restart Cursor** to load the hooks

3. **Verify installation**:
   ```bash
   curl http://127.0.0.1:37778/api/readiness
   ```

---

## Hook Mappings

| Cursor Hook | Script | Purpose |
|-------------|--------|---------|
| `beforeSubmitPrompt` | `session-init.sh` | Initialize VibeLearn session |
| `afterMCPExecution` | `save-observation.sh` | Capture MCP tool usage |
| `afterShellExecution` | `save-observation.sh` | Capture shell command execution |
| `afterFileEdit` | `save-file-edit.sh` | Capture file edits (for analysis) |
| `stop` | `session-summary.sh` | Trigger 5-step analysis pipeline |

---

## How It Works

### Session Initialization (`session-init.sh`)
- Called before each prompt submission
- Initializes a VibeLearn session in the worker using `conversation_id`
- Extracts project name from workspace root
- Outputs `{"continue": true}` to allow prompt submission

### Observation Capture (`save-observation.sh`)
- Captures MCP tool executions and shell commands
- Maps to VibeLearn observation format (tool type, file path, content)
- Sends to `POST /api/sessions/observations` (fire-and-forget)

### File Edit Capture (`save-file-edit.sh`)
- Captures file edits made by the agent
- Treats edits as `file_edit` observations
- File content is included (truncated at 10KB) for analysis

### Analysis Pipeline (`session-summary.sh`)
- Called when agent loop ends (stop hook)
- Triggers the 5-step analysis pipeline:
  ```
  POST /api/vibelearn/analyze/stack    → detect tech stack
  POST /api/vibelearn/analyze/static   → pattern analysis
  POST /api/vibelearn/analyze/concepts → concept extraction (LLM)
  POST /api/vibelearn/analyze/quiz     → quiz generation (LLM)
  POST /api/vibelearn/sync             → sync to vibelearn.dev
  ```

---

## Configuration

Settings in `~/.vibelearn/settings.json`:

```json
{
  "VIBELEARN_WORKER_PORT": "37778",
  "VIBELEARN_PROVIDER": "gemini",
  "VIBELEARN_GEMINI_API_KEY": "your-key",
  "VIBELEARN_AUTO_SYNC": "true"
}
```

**AI Provider Priority** (for concept extraction and quiz generation):
1. **Gemini** — set `VIBELEARN_GEMINI_API_KEY` (free tier: 1500 req/day)
2. **OpenRouter** — set `VIBELEARN_OPENROUTER_API_KEY`
3. **Anthropic** — uses `ANTHROPIC_API_KEY` from environment

---

## Using `vl` CLI After Sessions

```bash
vl quiz              # Interactive quiz — all pending questions
vl quiz --session    # Quiz from last session only
vl status            # Sessions analyzed, top concepts, mastery stats
vl gaps              # Concepts you haven't mastered yet
```

---

## Dependencies

Hook scripts require:
- `jq` — JSON processing
- `curl` — HTTP requests
- `bash` — Shell interpreter

Install on macOS: `brew install jq curl`
Install on Ubuntu: `apt-get install jq curl`

---

## Troubleshooting

### Hooks not executing

1. Check hooks location:
   ```bash
   ls ~/.cursor/hooks.json       # User-level
   ls .cursor/hooks.json         # Project-level
   ```

2. Verify scripts are executable:
   ```bash
   chmod +x ~/.cursor/hooks/*.sh
   ```

3. Check Cursor Settings → Hooks tab for errors

### Worker not responding

1. Verify worker is running:
   ```bash
   curl http://127.0.0.1:37778/api/readiness
   ```

2. Check worker logs:
   ```bash
   tail -f ~/.vibelearn/logs/vibelearn-$(date +%Y-%m-%d).log
   ```

3. Restart worker:
   ```bash
   bun run worker:restart
   ```

### No quiz questions after a session

1. Check that observations were captured:
   ```bash
   curl http://127.0.0.1:37778/api/health
   ```

2. Check worker logs for analysis pipeline errors — LLM calls require a configured provider

3. Run `vl status` to confirm concepts were extracted

---

## Files

- `hooks.json` — Hook configuration
- `common.sh` — Shared utility functions
- `session-init.sh` — Session initialization
- `save-observation.sh` — MCP and shell observation capture
- `save-file-edit.sh` — File edit observation capture
- `session-summary.sh` — Analysis pipeline trigger (stop hook)

## See Also

- [VibeLearn Documentation](https://vibelearn.dev)
- [INTEGRATION.md](INTEGRATION.md) — Architecture details
- [STANDALONE-SETUP.md](STANDALONE-SETUP.md) — Setup without Claude Code
