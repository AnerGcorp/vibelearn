# VibeLearn Cursor Configuration

## No Rules File Required

VibeLearn does not inject context into Cursor sessions. Unlike memory-based tools, VibeLearn focuses on capturing what you build and generating quiz questions afterward.

There is **no `.cursor/rules/vibelearn-context.mdc`** file to create or maintain.

---

## Optional: Agent Instructions for `vl` CLI

If you want the Cursor agent to be aware of VibeLearn and prompt you to review learning after sessions, you can create a rules file like this:

### `.cursor/rules/vibelearn.mdc`

```markdown
---
alwaysApply: false
description: "VibeLearn — learning capture and quiz workflow"
---

# VibeLearn

VibeLearn captures what I build during coding sessions and generates quiz questions.
After each session ends, I can run:

- `vl quiz` — interactive quiz from recent sessions
- `vl status` — sessions analyzed, top concept categories
- `vl gaps` — concepts not yet mastered

The analysis pipeline runs automatically when the Cursor agent stops.
No action needed during sessions — just code normally.

## Privacy

Wrap sensitive content in `<private>` tags to prevent storage:
`<private>my-secret-key</private>`
```

This is entirely optional. The hooks work without any rules file.

---

## `.gitignore` Note

No VibeLearn files should be committed from Cursor workspace:

```gitignore
# VibeLearn — all data is stored in ~/.vibelearn/
# Nothing to ignore in the project directory
```

The database (`~/.vibelearn/vibelearn.db`) and settings (`~/.vibelearn/settings.json`) live outside the project.
