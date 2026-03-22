# VibeLearn OpenClaw Integration

> **Note**: OpenClaw integration is not currently implemented in VibeLearn. VibeLearn is a Claude Code plugin and Cursor integration. This file is a placeholder for future OpenClaw support.

## What VibeLearn Does

VibeLearn captures coding sessions, extracts learning concepts, and generates quiz questions. It runs as:
- A **Claude Code plugin** (5-hook lifecycle)
- A **Cursor integration** (hook scripts)
- A **local CLI** (`vl quiz`, `vl status`, `vl gaps`)

## Current Supported Platforms

| Platform | Status |
|----------|--------|
| Claude Code | ✅ Full support via plugin hooks |
| Cursor | ✅ Full support via hook scripts |
| OpenClaw | ❌ Not yet implemented |

## Worker API

The VibeLearn worker runs on port **37778** (not 37777) and exposes:

```
GET  /api/health
GET  /api/readiness
POST /api/sessions/init
POST /api/sessions/observations
POST /api/vibelearn/analyze/stack
POST /api/vibelearn/analyze/static
POST /api/vibelearn/analyze/concepts
POST /api/vibelearn/analyze/quiz
POST /api/vibelearn/sync
GET  /api/vibelearn/profile
GET  /api/vibelearn/questions/pending
```

For OpenClaw integration, the key endpoints to call are:
1. `POST /api/sessions/init` — when an agent session starts
2. `POST /api/sessions/observations` — for each tool use
3. The 5 analysis endpoints — when the session ends

## See Also

- [README.md](../README.md) — Main VibeLearn documentation
- [cursor-hooks/README.md](../cursor-hooks/README.md) — Cursor integration
- [src/services/worker/README.md](../src/services/worker/README.md) — Worker API reference
