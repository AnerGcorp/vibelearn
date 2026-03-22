# VibeLearn for Cursor (Standalone — No Claude Code Required)

> **Learn from every Cursor session — Zero Cost to Start**

## Overview

Use VibeLearn with Cursor without a Claude Code subscription. Choose between free-tier AI providers (Gemini, OpenRouter) for the concept extraction and quiz generation pipeline.

**What You Get**:
- **Automatic capture** of file edits, MCP tools, and shell commands during agent sessions
- **Analysis pipeline** runs when each session ends: stack detection → concept extraction → quiz generation
- **`vl quiz`** — interactive terminal quiz to review what you learned
- **`vl status`** — sessions analyzed, top concept categories, mastery stats

---

## Prerequisites

### macOS / Linux
- Cursor IDE
- [Bun](https://bun.sh) (`curl -fsSL https://bun.sh/install | bash`)
- Git
- `jq` and `curl`:
  - **macOS**: `brew install jq curl`
  - **Linux**: `apt install jq curl`

### Windows
- Cursor IDE
- [Bun](https://bun.sh) (PowerShell: `powershell -c "irm bun.sh/install.ps1 | iex"`)
- Git
- PowerShell 5.1+ (included with Windows 10/11)

---

## Step 1: Clone VibeLearn

```bash
git clone https://github.com/anergcorp/vibelearn.git
cd vibelearn
bun install
bun run build
```

---

## Step 2: Configure AI Provider (Choose One)

VibeLearn needs an LLM for concept extraction and quiz generation. Provider priority order:
1. Gemini (if `VIBELEARN_GEMINI_API_KEY` is set)
2. OpenRouter (if `VIBELEARN_OPENROUTER_API_KEY` is set)
3. Anthropic (if `ANTHROPIC_API_KEY` is set in environment)

### Option A: Gemini (Recommended — Free Tier)

1500 free requests/day — sufficient for daily coding sessions.

```bash
mkdir -p ~/.vibelearn
cat > ~/.vibelearn/settings.json << 'EOF'
{
  "VIBELEARN_GEMINI_API_KEY": "YOUR_GEMINI_API_KEY"
}
EOF
```

**Get your free API key**: https://aistudio.google.com/apikey

### Option B: OpenRouter (100+ Models)

Includes free model options.

```bash
mkdir -p ~/.vibelearn
cat > ~/.vibelearn/settings.json << 'EOF'
{
  "VIBELEARN_OPENROUTER_API_KEY": "YOUR_OPENROUTER_API_KEY"
}
EOF
```

**Get your API key**: https://openrouter.ai/keys

Free models available:
- `google/gemini-2.0-flash-exp:free`
- `xiaomi/mimo-v2-flash:free`

### Option C: Anthropic API

```bash
mkdir -p ~/.vibelearn
cat > ~/.vibelearn/settings.json << 'EOF'
{
  "ANTHROPIC_API_KEY": "YOUR_ANTHROPIC_API_KEY"
}
EOF
```

---

## Step 3: Install Cursor Hooks

```bash
# Recommended — all projects
bun run cursor:install -- user

# Or current project only
bun run cursor:install
```

This installs hook scripts to `.cursor/hooks/` and `hooks.json` configuration.

---

## Step 4: Start the Worker

```bash
bun run worker:start
```

Verify it's running:
```bash
curl http://127.0.0.1:37778/api/readiness
# → {"status":"ready"}
```

---

## Step 5: Restart Cursor & Verify

1. **Restart Cursor IDE** to load the new hooks
2. **Run an agent session** and edit some files
3. **After the session ends**, run:
   ```bash
   vl status      # Shows sessions analyzed and concepts extracted
   vl quiz        # Interactive quiz from the session
   ```

---

## How It Works

1. **Before each prompt**: Hooks initialize a VibeLearn session in the worker
2. **During agent work**: File edits, MCP tool usage, and shell commands are captured as observations
3. **When agent stops**: `session-summary.sh` triggers the 5-step analysis pipeline
4. **After analysis**: `vl quiz` shows questions generated from your session

---

## Troubleshooting

### No quiz questions generated

Verify your AI provider key is configured:
```bash
cat ~/.vibelearn/settings.json
```

Check worker logs for LLM errors:
```bash
tail -f ~/.vibelearn/logs/vibelearn-$(date +%Y-%m-%d).log
```

### Worker not starting

```bash
tail -f ~/.vibelearn/logs/vibelearn-$(date +%Y-%m-%d).log
```

### Hooks not executing

```bash
# Verify hook scripts are executable
chmod +x ~/.cursor/hooks/*.sh

# Check Cursor Settings → Hooks tab for errors
```

### Rate limiting (Gemini free tier)

If you hit the 1500 requests/day limit:
- Wait until the next day (resets at midnight Pacific)
- Switch to OpenRouter with a free model

---

## Windows Installation

```powershell
# Clone and build
git clone https://github.com/anergcorp/vibelearn.git
cd vibelearn
bun install
bun run build

# Configure provider (Gemini example)
$settingsDir = "$env:USERPROFILE\.vibelearn"
New-Item -ItemType Directory -Force -Path $settingsDir

@"
{
  "VIBELEARN_GEMINI_API_KEY": "YOUR_GEMINI_API_KEY"
}
"@ | Out-File -FilePath "$settingsDir\settings.json" -Encoding UTF8

# Interactive setup
bun run cursor:setup
```

### Windows Hook Scripts

The installer copies PowerShell scripts to `.cursor\hooks\`:

| Script | Purpose |
|--------|---------|
| `common.ps1` | Shared utilities |
| `session-init.ps1` | Initialize session on prompt |
| `save-observation.ps1` | Capture MCP/shell usage |
| `save-file-edit.ps1` | Capture file edits |
| `session-summary.ps1` | Trigger analysis pipeline on stop |

### Enable Script Execution (if needed)

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Windows Troubleshooting

**Worker not responding** — check if port 37778 is in use:
```powershell
Get-NetTCPConnection -LocalPort 37778
```

---

## Quick Reference

| Command | Purpose |
|---------|---------|
| `bun run cursor:install -- user` | Install hooks for all projects |
| `bun run cursor:install` | Install hooks for current project |
| `bun run worker:start` | Start the background worker |
| `bun run worker:stop` | Stop the worker |
| `bun run worker:restart` | Restart the worker |
| `vl quiz` | Interactive quiz (all pending questions) |
| `vl status` | Sessions analyzed, concepts, mastery |
| `vl gaps` | Concepts not yet mastered |
| `vl login <api-key>` | Connect to vibelearn.dev |
