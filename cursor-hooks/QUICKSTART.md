# Quick Start: VibeLearn + Cursor

> **Learn from every Cursor session in under 5 minutes**

## What This Does

Connects VibeLearn to Cursor so that:
- **File edits and tool usage** are automatically captured during agent sessions
- **Analysis pipeline runs** when each session ends (stack detection → concept extraction → quiz generation)
- **`vl quiz`** lets you review what you built and learned

---

## Installation (2 minutes)

```bash
# Install globally (all projects — recommended)
bun run cursor:install -- user

# Or install for current project only
bun run cursor:install
```

## Configure AI Provider (Required)

VibeLearn needs an LLM for concept extraction and quiz generation. Provider priority:

```bash
# Option A: Gemini (free tier available — recommended)
# 1500 free requests/day at https://aistudio.google.com/apikey
mkdir -p ~/.vibelearn
cat > ~/.vibelearn/settings.json << 'EOF'
{
  "VIBELEARN_GEMINI_API_KEY": "your-gemini-api-key"
}
EOF

# Option B: OpenRouter (100+ models, free options)
# Get key at https://openrouter.ai/keys
cat > ~/.vibelearn/settings.json << 'EOF'
{
  "VIBELEARN_OPENROUTER_API_KEY": "your-openrouter-api-key"
}
EOF
```

## Start Worker

```bash
bun run worker:start

# Verify it's running
curl http://127.0.0.1:37778/api/readiness
# → {"status":"ready"}
```

## Restart Cursor

Restart Cursor IDE to load the new hooks.

---

## Verify It's Working

1. Open Cursor Settings → Hooks tab — you should see the hooks listed
2. Start an agent session and edit some files
3. End the session (agent stops)
4. Run `vl status` — you should see a session with concepts extracted
5. Run `vl quiz` — questions from your session appear

---

## What Gets Captured

| Activity | Captured |
|----------|----------|
| File edits by agent | ✅ file_path + content (for analysis) |
| MCP tool usage | ✅ tool_name, inputs, outputs |
| Shell commands | ✅ command + output |
| Session boundaries | ✅ start/stop lifecycle |

## What Gets Generated

After each session:
- **Tech stack profile** — detected frameworks, ORMs, tools
- **Session summary** — human-readable narrative of what was built
- **Concepts** — specific things you encountered (e.g., "React Server Actions", "SQLite WAL mode")
- **Quiz questions** — `multiple_choice`, `fill_in_blank`, `explain_code` per concept

---

## Using `vl` CLI

```bash
vl quiz              # Interactive quiz — all pending questions
vl quiz --session    # Quiz from last session only
vl status            # Sessions analyzed, top concept categories, mastery stats
vl gaps              # Concepts you haven't mastered yet (mastery < 50%)

vl login <api-key>   # Connect to vibelearn.dev dashboard
```

---

## Troubleshooting

**Hooks not running?**
- Check Cursor Settings → Hooks tab for errors
- Verify scripts are executable: `chmod +x ~/.cursor/hooks/*.sh`
- Check Hooks output channel in Cursor

**Worker not responding?**
- Check: `curl http://127.0.0.1:37778/api/readiness`
- Logs: `tail -f ~/.vibelearn/logs/vibelearn-$(date +%Y-%m-%d).log`
- Restart: `bun run worker:restart`

**No quiz questions generated?**
- Verify an AI provider key is configured in `~/.vibelearn/settings.json`
- Check worker logs for LLM call errors
- Run `vl status` to confirm sessions and concepts were recorded

---

## Next Steps

- Read [README.md](README.md) for detailed documentation
- Read [INTEGRATION.md](INTEGRATION.md) for architecture details
- Visit [vibelearn.dev](https://vibelearn.dev) for the dashboard and API key
