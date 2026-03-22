<h1 align="center">
  <br>
  <a href="https://vibelearn.dev">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/anergcorp/vibelearn/main/docs/public/vibelearn-logo-for-dark-mode.webp">
      <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/anergcorp/vibelearn/main/docs/public/vibelearn-logo-for-light-mode.webp">
      <img src="https://raw.githubusercontent.com/anergcorp/vibelearn/main/docs/public/vibelearn-logo-for-light-mode.webp" alt="VibeLearn" width="400">
    </picture>
  </a>
  <br>
</h1>

<h4 align="center">Learn from every session. Built for <a href="https://claude.com/claude-code" target="_blank">Claude Code</a>.</h4>

<p align="center">
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/License-AGPL%203.0-blue.svg" alt="License">
  </a>
  <a href="package.json">
    <img src="https://img.shields.io/badge/version-0.1.0-green.svg" alt="Version">
  </a>
  <a href="package.json">
    <img src="https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg" alt="Node">
  </a>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#how-it-works">How It Works</a> •
  <a href="#vl-cli">vl CLI</a> •
  <a href="#configuration">Configuration</a> •
  <a href="#privacy">Privacy</a> •
  <a href="#troubleshooting">Troubleshooting</a>
</p>

<p align="center">
  VibeLearn is a Claude Code plugin that silently watches what you build, extracts the concepts you encounter, and turns them into quiz questions — so you actually retain what you learn while coding.
</p>

---

## What It Does

Every time you end a Claude Code session, VibeLearn automatically:

1. **Detects your tech stack** — reads `package.json`, `pyproject.toml`, `go.mod`, etc.
2. **Analyzes your code changes** — identifies patterns: custom hooks, API routes, TypeScript types, design patterns
3. **Extracts learning concepts** — a single LLM call produces a session summary and a list of concepts you encountered
4. **Generates quiz questions** — a second LLM call creates targeted `multiple_choice`, `fill_in_blank`, and `explain_code` questions per concept
5. **Syncs to vibelearn.dev** — your learning profile is stored securely (optional, requires `vl login`)

Then run `vl quiz` to review what you learned.

---

## Quick Start

Install the plugin in a Claude Code session:

```
/plugin marketplace add anergcorp/vibelearn
/plugin install vibelearn
```

Restart Claude Code. VibeLearn will start capturing learning data automatically from your next session.

**Optional — connect to vibelearn.dev:**

```bash
vl login <your-api-key>
```

Get your API key at [vibelearn.dev](https://vibelearn.dev).

---

## vl CLI

The `vl` command lets you review and interact with your learning data:

```bash
vl quiz              # Interactive quiz — all pending questions
vl quiz --session    # Quiz questions from the last session only

vl status            # Sessions analyzed, top concept categories, mastery stats
vl gaps              # Concepts you haven't mastered yet (mastery < 50%)

vl login <api-key>   # Connect to vibelearn.dev
vl login --status    # Check login status
```

**Example session:**

```
$ vl quiz

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  VibeLearn Quiz — 3 questions
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Q1/3 (intermediate) [React Server Actions]

  Code:
    'use server'
    export async function createPost(data: FormData) { ... }

  What does the 'use server' directive tell Next.js?

  A) Run this function in a Web Worker
  B) Execute this function on the server, not the client
  C) Cache the function result server-side
  D) Mark the function as async-only

  Your answer (A/B/C/D): B

  ✓ Correct!

  Explanation: 'use server' creates a Server Action — a function that
  runs exclusively on the server. The client receives only the result.
```

---

## How It Works

### 5 Lifecycle Hooks

```
SessionStart    → Worker starts, session initialized
UserPromptSubmit → Session linked to user prompt
PostToolUse     → File edits/writes/bash commands captured
Stop (Summary)  → 5-step analysis pipeline runs
SessionEnd      → Session finalized
```

### Analysis Pipeline (runs at session end)

```
1. StackDetector   — reads package.json/config files → vl_stack_profiles
2. StaticAnalyzer  — regex/AST patterns on code changes (hooks, routes, types…)
3. ConceptExtractor — LLM call → session summary + concept list → vl_concepts
4. QuizGenerator   — LLM call → quiz questions per concept → vl_questions
5. UpstreamSync    — HMAC-signed POST to api.vibelearn.dev (queued offline if unavailable)
```

### Worker Service

An Express HTTP server on port **37778**, managed by Bun. Hooks talk to it over localhost. It handles all database writes and the analysis pipeline.

### Database

SQLite at `~/.vibelearn/vibelearn.db`. Key tables:

| Table | Purpose |
|-------|---------|
| `vibelearn_session_summaries` | Human-readable session narratives |
| `vl_concepts` | Extracted concepts per session |
| `vl_questions` | Generated quiz questions |
| `vl_quiz_attempts` | Your answers (HMAC-signed before sync) |
| `vl_developer_profile` | Mastery score per concept |
| `vl_stack_profiles` | Detected tech stack per session |
| `vl_sync_queue` | Offline retry queue |

---

## Configuration

Settings are auto-created at `~/.vibelearn/settings.json` on first run.

**Key settings:**

```json
{
  "VIBELEARN_WORKER_PORT": "37778",
  "VIBELEARN_DATA_DIR": "~/.vibelearn",
  "VIBELEARN_LOG_LEVEL": "INFO",
  "VIBELEARN_PROVIDER": "claude",
  "VIBELEARN_GEMINI_API_KEY": "",
  "VIBELEARN_OPENROUTER_API_KEY": "",
  "VIBELEARN_AUTO_SYNC": "true",
  "VIBELEARN_EXCLUDED_PROJECTS": ""
}
```

**AI Provider for Analysis**

The analysis pipeline (concept extraction + quiz generation) uses your configured LLM provider. Priority order:

1. **Gemini** — set `VIBELEARN_GEMINI_API_KEY` (free tier available)
2. **OpenRouter** — set `VIBELEARN_OPENROUTER_API_KEY`
3. **Anthropic** — uses `ANTHROPIC_API_KEY` from environment (claude-haiku-4-5)

**Excluding projects:**

```json
{
  "VIBELEARN_EXCLUDED_PROJECTS": "/path/to/skip,~/personal/*"
}
```

---

## Privacy

Wrap any content in `<private>` tags to prevent it from being stored or synced:

```
Please review <private>my-secret-api-key: sk-...</private> configuration
```

Everything inside `<private>` is stripped at the hook layer before reaching the worker or database.

**What is never stored:**
- Absolute file paths (only basenames are sent upstream)
- Raw file contents (only short snippets from the analysis)
- Full user prompts

**Anti-tamper:** Quiz attempt records are HMAC-signed with your API key before syncing. The server recomputes your streak from accepted attempt records — local SQLite data cannot be used to fake progress.

---

## System Requirements

- **Node.js**: 18.0.0 or higher
- **Claude Code**: Latest version with plugin support
- **Bun**: JavaScript runtime (auto-installed if missing)

---

## Windows Notes

If you see `npm : The term 'npm' is not recognized`:

Install [Node.js](https://nodejs.org) and restart your terminal. Bun is auto-installed by the plugin setup script.

---

## Build

```bash
npm install
npm run build-and-sync   # Build + sync to marketplace + restart worker
```

Built outputs land in `plugin/scripts/`:
- `worker-service.cjs` — the worker daemon
- `mcp-server.cjs` — MCP tools
- `vl-cli.cjs` — the `vl` binary

---

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Update documentation
5. Submit a Pull Request

---

## License

GNU Affero General Public License v3.0 (AGPL-3.0).

See the [LICENSE](LICENSE) file for full details.

---

## Support

- **Issues**: [GitHub Issues](https://github.com/anergcorp/vibelearn/issues)
- **Website**: [vibelearn.dev](https://vibelearn.dev)
- **Repository**: [github.com/anergcorp/vibelearn](https://github.com/anergcorp/vibelearn)

---

**Built with Claude Agent SDK** | **Powered by Claude Code** | **Made with TypeScript**
