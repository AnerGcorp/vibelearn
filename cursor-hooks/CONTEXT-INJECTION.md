# Learning Capture in Cursor Hooks

## Overview

VibeLearn does **not** inject context into Cursor prompts. Instead, it captures what you build and generates quiz questions after each session. Context injection has been removed in favor of a learning-first model: build, analyze, quiz.

---

## What Gets Captured

| Hook | Event | Captured Data |
|------|-------|---------------|
| `afterFileEdit` | File modified by agent | file_path, edit content (up to 10KB) |
| `afterMCPExecution` | MCP tool used | tool_name, inputs, outputs |
| `afterShellExecution` | Shell command run | command, stdout/stderr |
| `beforeSubmitPrompt` | Session starts | session_id, project, prompt |
| `stop` | Agent loop ends | triggers analysis pipeline |

---

## Analysis Pipeline (Runs on Session End)

When `session-summary.sh` runs, it calls these endpoints sequentially:

```
POST /api/vibelearn/analyze/stack
  → reads package.json / pyproject.toml / go.mod
  → stores detected framework, ORM, testing tools in vl_stack_profiles

POST /api/vibelearn/analyze/static
  → pattern analysis on files_modified during session
  → detects: custom hooks, API routes, DB queries, auth patterns

POST /api/vibelearn/analyze/concepts
  → single LLM call (Gemini → OpenRouter → Anthropic)
  → produces session narrative + concept list → vl_concepts

POST /api/vibelearn/analyze/quiz
  → second LLM call: quiz questions per concept → vl_questions
  → skips concepts with mastery_score > 0.85

POST /api/vibelearn/sync
  → HMAC-signed POST to api.vibelearn.dev (queued offline if unavailable)
```

---

## After Analysis: Using `vl`

Once the pipeline completes (usually within 30–60 seconds of session end):

```bash
vl quiz              # Interactive quiz — questions from all sessions
vl quiz --session    # Questions from last session only
vl status            # Sessions analyzed, top concept categories, mastery
vl gaps              # Concepts seen but not yet mastered (mastery < 50%)
```

---

## Privacy

Wrap any content in `<private>` tags to prevent it from being stored or analyzed:

```
Please review <private>my-secret-api-key: sk-...</private> configuration
```

Content inside `<private>` is stripped at the hook layer before reaching the worker or database.

**What is never stored:**
- Absolute file paths (only basenames sent upstream)
- Raw file contents (only short snippets from analysis)
- Full shell command outputs beyond the first 2KB

---

## No Rules File / No Context Injection

Unlike other memory tools, VibeLearn does **not** write to `.cursor/rules/`. There is no `vibelearn-context.mdc` file. The value is in the quiz — run `vl quiz` after a session to review concepts you encountered.

If you want the `vl` CLI available globally:

```bash
# From the vibelearn repo
npm link
# or
ln -s $(pwd)/plugin/scripts/vl-cli.cjs ~/.local/bin/vl
```
