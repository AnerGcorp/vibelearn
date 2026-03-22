---
name: Bug report
about: Report a bug in VibeLearn
title: '[Bug] '
labels: 'bug, needs-triage'
assignees: ''
---

## Before Submitting

- [ ] I searched [existing issues](https://github.com/anergcorp/vibelearn/issues) and confirmed this is not a duplicate

---

## Bug Description

A clear description of what the bug is.

## Steps to Reproduce

1. ...
2. ...
3. ...

## Expected Behavior

What you expected to happen.

## Actual Behavior

What actually happened.

## Environment

- **VibeLearn version**: (run `vl status`)
- **Claude Code version**: (from the Claude Code menu)
- **OS / Platform**: (e.g. macOS 14, Ubuntu 22.04, Windows 11)
- **Node.js version**: (`node --version`)
- **Bun version**: (`bun --version`)

## Worker Diagnostics

```bash
curl -s http://127.0.0.1:37778/api/health | jq .
curl -s http://127.0.0.1:37778/api/admin/doctor | jq .
```

Paste output here:

```
(paste here)
```

## Relevant Logs

Worker logs are at `~/.vibelearn/logs/vibelearn-YYYY-MM-DD.log`

```
(paste relevant lines here)
```

## Additional Context

Any other context about the problem.
