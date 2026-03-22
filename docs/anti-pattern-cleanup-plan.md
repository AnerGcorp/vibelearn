# Error Handling Anti-Pattern Cleanup

> **Status**: Archived. This document tracked anti-patterns in the legacy VibeLearn codebase. Many of the files listed here (ChromaSync.ts, context-generator.ts, SearchManager.ts, etc.) have been removed as part of the VibeLearn fork.

## Active Files to Review

For the current VibeLearn codebase, focus on these files if anti-patterns are detected:

- `src/services/worker-service.ts`
- `src/services/worker/http/routes/VibeLearnRoutes.ts`
- `src/services/analysis/ConceptExtractor.ts`
- `src/services/analysis/QuizGenerator.ts`
- `src/services/sync/UpstreamSync.ts`
- `src/services/sync/OfflineQueue.ts`
- `src/cli/vl/index.ts`

## Anti-Pattern Guidelines

VibeLearn follows the **fail-open** principle for hooks:

1. **Hook errors exit 0** — never block a Claude Code session
2. **Analysis pipeline is fire-and-forget** — step failures are logged, not fatal
3. **Prefer `error instanceof Error`** over bare `catch (e)` string coercion
4. **No bare `catch` that swallows errors silently** — always log at ERROR level

Run the detector (if available):
```bash
bun run scripts/anti-pattern-test/detect-error-handling-antipatterns.ts
```
