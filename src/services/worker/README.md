# Worker Service Architecture

## Overview

The Worker Service is an Express HTTP server that handles all VibeLearn operations. It runs on port **37778** (configurable via `VIBELEARN_WORKER_PORT`) and is managed by Bun.

## Request Flow

```
Hook (plugin/scripts/*-hook.cjs)
  → HTTP Request to Worker (localhost:37778)
    → Route Handler (src/services/worker/http/routes/*.ts)
      → Service Layer / Analysis Pipeline
        → SQLite Database (~/.vibelearn/vibelearn.db)
```

## Directory Structure

```
src/services/worker/
├── http/
│   ├── BaseRouteHandler.ts       # Shared try-catch, validation, error helpers
│   ├── Middleware.ts             # CORS, body parsing, request logging
│   └── routes/
│       ├── SessionRoutes.ts      # Session lifecycle (init, observations, summarize, complete)
│       ├── VibeLearnRoutes.ts    # Analysis pipeline + profile/quiz endpoints
│       ├── DataRoutes.ts         # Data retrieval (observations, summaries, stats)
│       ├── SearchRoutes.ts       # Legacy search endpoints (context injection stubs)
│       ├── SettingsRoutes.ts     # Settings CRUD
│       ├── LogsRoutes.ts         # Log file access
│       ├── MemoryRoutes.ts       # Raw DB access helpers
│       └── ViewerRoutes.ts       # SSE stream for real-time updates
├── DatabaseManager.ts            # Single long-lived SQLite connection
├── SessionManager.ts             # In-memory session state (active sessions)
├── SDKAgent.ts                   # Claude Agent SDK for observation compression
├── GeminiAgent.ts                # Gemini provider (observation compression)
├── OpenRouterAgent.ts            # OpenRouter provider (observation compression)
├── SSEBroadcaster.ts             # Server-Sent Events
├── PaginationHelper.ts           # Query pagination
└── SettingsManager.ts            # User settings CRUD
```

## VibeLearn Analysis Endpoints

These are the new endpoints that power the learning pipeline (POST `/api/sessions/summarize` triggers all 5 steps sequentially via the summarize hook):

| Endpoint | Description |
|----------|-------------|
| `POST /api/vibelearn/analyze/stack` | Detect tech stack from session file paths → `vl_stack_profiles` |
| `POST /api/vibelearn/analyze/static` | Run regex pattern analysis on modified files |
| `POST /api/vibelearn/analyze/concepts` | LLM concept extraction → `vibelearn_session_summaries` + `vl_concepts` |
| `POST /api/vibelearn/analyze/quiz` | LLM quiz generation → `vl_questions` |
| `POST /api/vibelearn/sync` | Flush offline queue + HMAC-signed sync to api.vibelearn.dev |
| `GET /api/vibelearn/profile` | Developer mastery profile |
| `GET /api/vibelearn/questions/pending` | Unanswered questions (used by `vl quiz`) |
| `GET /api/vibelearn/sessions/:id/summary` | Session summary + concepts |

## Session Lifecycle Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /api/sessions/init` | Initialize session (UserPromptSubmit hook) |
| `POST /api/sessions/observations` | Queue observation (PostToolUse hook) |
| `POST /api/sessions/summarize` | Trigger end-of-session pipeline (Stop hook) |
| `POST /api/sessions/complete` | Mark session done (SessionEnd hook) |

## System Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/health` | Health check (always responds, even during init) |
| `GET /api/readiness` | 503 until DB initialized |
| `GET /api/version` | Built-in version string |
| `POST /api/admin/restart` | Graceful restart (localhost only) |
| `POST /api/admin/shutdown` | Graceful shutdown (localhost only) |
| `GET /api/admin/doctor` | Diagnostic view of supervisor + processes |

## Adding New Endpoints

1. Choose or create a route file in `src/services/worker/http/routes/`
2. Extend `BaseRouteHandler` for automatic error handling
3. Add a handler method and register it in `setupRoutes()`
4. Register the route class in `registerRoutes()` in `worker-service.ts`

```typescript
// In VibeLearnRoutes.ts
private async handleMyEndpoint(req: Request, res: Response): Promise<void> {
  const { contentSessionId } = req.body;
  if (!contentSessionId) return this.badRequest(res, 'Missing contentSessionId');
  // ... logic
  res.json({ status: 'ok' });
}

setupRoutes(app: Application): void {
  app.post('/api/vibelearn/my-endpoint', this.wrapHandler(this.handleMyEndpoint.bind(this)));
}
```

## Key Design Principles

1. **Fail open** — Hook errors exit 0 so Claude Code sessions are never blocked
2. **Non-blocking** — Analysis pipeline runs asynchronously after session end
3. **Port 37778** — Changed from 37777 to avoid conflicts with older installations
4. **Single DB connection** — `DatabaseManager` holds one long-lived SQLite connection
5. **BaseRouteHandler** — All route classes extend this for consistent error handling
