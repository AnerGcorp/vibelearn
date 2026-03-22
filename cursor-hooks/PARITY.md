# Feature Parity: VibeLearn Claude Code Hooks vs Cursor Hooks

This document compares VibeLearn's Claude Code hooks with the Cursor hooks implementation.

## Hook Mapping

| Claude Code Hook | Cursor Hook | Status | Notes |
|-----------------|-------------|--------|-------|
| `SessionStart` → session init | `beforeSubmitPrompt` → `session-init.sh` | ✅ Complete | Session initialization |
| `UserPromptSubmit` → observation enrichment | `beforeSubmitPrompt` → `session-init.sh` | ✅ Partial | No privacy pre-check in Cursor |
| `PostToolUse` (Write/Edit) → file capture | `afterFileEdit` → `save-file-edit.sh` | ✅ Complete | File edit observation capture |
| `PostToolUse` (Bash) → bash capture | `afterShellExecution` → `save-observation.sh` | ✅ Complete | Shell command capture |
| `PostToolUse` (other tools) | `afterMCPExecution` → `save-observation.sh` | ✅ Complete | MCP tool capture |
| `Stop` → analysis pipeline | `stop` → `session-summary.sh` | ✅ Partial | No transcript access in Cursor |

## Feature Comparison

### 1. Session Initialization

| Feature | Claude Code | Cursor | Status |
|---------|-------------|--------|--------|
| Worker health check | ✅ retries (15s) | ✅ retries (15s) | ✅ Match |
| Session init API call | ✅ `/api/sessions/init` | ✅ `/api/sessions/init` | ✅ Match |
| Project name extraction | ✅ from cwd | ✅ from workspace_roots | ✅ Match |
| Privacy check handling | ✅ `skipped` + `reason` | ⚠️ Not pre-checked | ⚠️ Worker handles |

### 2. File Edit / Tool Capture

| Feature | Claude Code | Cursor | Status |
|---------|-------------|--------|--------|
| File edit capture | ✅ Write/Edit tools via PostToolUse | ✅ `afterFileEdit` hook | ✅ Match |
| Content truncation (10KB) | ✅ Observation handler | ✅ `save-file-edit.sh` | ✅ Match |
| Bash/shell capture | ✅ Bash tool via PostToolUse | ✅ `afterShellExecution` hook | ✅ Match |
| MCP tool capture | ✅ Any tool via PostToolUse | ✅ `afterMCPExecution` hook | ✅ Match |
| Fire-and-forget | ✅ | ✅ | ✅ Match |

### 3. Analysis Pipeline (Session End)

| Feature | Claude Code | Cursor | Status |
|---------|-------------|--------|--------|
| Stack detection | ✅ `/api/vibelearn/analyze/stack` | ✅ `/api/vibelearn/analyze/stack` | ✅ Match |
| Static analysis | ✅ `/api/vibelearn/analyze/static` | ✅ `/api/vibelearn/analyze/static` | ✅ Match |
| Concept extraction (LLM) | ✅ `/api/vibelearn/analyze/concepts` | ✅ `/api/vibelearn/analyze/concepts` | ✅ Match |
| Quiz generation (LLM) | ✅ `/api/vibelearn/analyze/quiz` | ✅ `/api/vibelearn/analyze/quiz` | ✅ Match |
| Upstream sync | ✅ `/api/vibelearn/sync` | ✅ `/api/vibelearn/sync` | ✅ Match |
| Transcript context | ✅ last_assistant_message | ❌ Not available | ⚠️ Cursor limitation |

**Impact of no transcript**: Concept extraction still works via file-edit observations. Without the last assistant message, concepts may be slightly less targeted. The pipeline still produces useful quiz questions.

## Missing Features (Cursor Platform Limitations)

1. **Transcript access**: Cursor stop hooks don't provide the conversation transcript path
   - **Impact**: `last_assistant_message` sent as empty string to concept extractor
   - **Workaround**: File edit observations still provide rich signal for concept extraction

2. **SessionStart hook**: Cursor's `beforeSubmitPrompt` is per-prompt, not per-session-start
   - **Impact**: Minor — session init is called each prompt but worker deduplicates

## Enhancements (Cursor-Specific)

1. **MCP tool capture via dedicated hook**: `afterMCPExecution` provides structured tool data
2. **Shell capture via dedicated hook**: `afterShellExecution` provides command + output separately
3. **File edit hook**: `afterFileEdit` fires synchronously after each edit (Claude Code batches these via PostToolUse)

## Summary

| Category | Status |
|----------|--------|
| Session Management | ✅ Complete parity |
| Observation Capture | ✅ Complete parity |
| Analysis Pipeline | ✅ Complete parity |
| Transcript Context | ⚠️ Partial (no transcript in Cursor) |

**Overall**: The Cursor integration achieves full functional parity with VibeLearn's Claude Code hooks for all core features. The only gap is transcript access at session end, which has minor impact on concept extraction quality.
