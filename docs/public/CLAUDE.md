# VibeLearn Public Documentation

## What This Folder Is

`docs/public/` is the **Mintlify documentation site** for VibeLearn — user-facing docs at docs.vibelearn.dev.

## Folder Structure

```
docs/
├── public/           ← You are here (Mintlify .mdx files)
│   ├── docs.json    — Navigation and site config
│   ├── *.mdx        — Top-level pages
│   ├── architecture/ — Technical architecture docs
│   ├── cursor/       — Cursor integration guides
│   └── usage/        — User guides
└── context/          ← Internal reference docs (NOT user-facing)
    └── *.md          — Planning docs, API references, hooks reference
```

## Current Pages

### Navigation (from docs.json)

**Get Started**
- `introduction.mdx` — What VibeLearn is and how it works
- `installation.mdx` — Install as Claude Code plugin
- `usage/getting-started.mdx` — First session workflow
- `usage/private-tags.mdx` — `<private>` tag privacy control

**AI Providers**
- `usage/gemini-provider.mdx` — Gemini setup (free tier)
- `usage/openrouter-provider.mdx` — OpenRouter setup

**Cursor Integration**
- `cursor/index.mdx` — Overview
- `cursor/gemini-setup.mdx` — Cursor + Gemini
- `cursor/openrouter-setup.mdx` — Cursor + OpenRouter

**Configuration & Development**
- `configuration.mdx` — Settings reference
- `development.mdx` — Build from source
- `troubleshooting.mdx` — Common issues
- `platform-integration.mdx` — Worker API for other IDEs

**Architecture**
- `architecture/overview.mdx` — System components + data flow
- `hooks-architecture.mdx` — 5-hook lifecycle
- `architecture/hooks.mdx` — Hook implementation details
- `architecture/worker-service.mdx` — Worker API reference
- `architecture/database.mdx` — SQLite schema

## What Does NOT Belong Here

Planning docs, API references, and research notes → `/docs/context/`

## Development

```bash
# Run local Mintlify dev server
npx mintlify dev

# Validate docs
npx mintlify validate
```

## Adding a New Page

1. Create `.mdx` file in the right subdirectory
2. Add path to `docs.json` navigation groups
3. Use Mintlify MDX frontmatter: `title`, `description`
