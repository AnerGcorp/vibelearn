---
name: timeline-report
description: Generate a learning summary report analyzing a project's VibeLearn sessions, concepts, and mastery progress. Use when asked for a learning report, concept summary, or quiz progress overview.
---

# Learning Summary Report

Generate a comprehensive report of your learning progress from VibeLearn's captured sessions.

## When to Use

Use when users ask for:
- "Show my learning report"
- "Summarize what I've learned"
- "What concepts have I encountered?"
- "Show my quiz progress"
- "What are my learning gaps?"

## Workflow

### Step 1: Check Worker Status

```bash
curl -s http://127.0.0.1:37778/api/health | jq .
```

If the worker isn't running, prompt the user to start it.

### Step 2: Fetch Learning Data

```bash
# Developer profile (mastery per concept)
curl -s http://127.0.0.1:37778/api/vibelearn/profile | jq .

# Pending quiz questions
curl -s http://127.0.0.1:37778/api/vibelearn/questions/pending | jq .
```

Or query the database directly for richer data:

```bash
sqlite3 ~/.vibelearn/vibelearn.db << 'SQL'
-- Session summary
SELECT COUNT(*) as sessions FROM vibelearn_session_summaries;

-- Top concept categories
SELECT category, COUNT(*) as count
FROM vl_concepts
GROUP BY category
ORDER BY count DESC
LIMIT 10;

-- Mastery overview
SELECT
  COUNT(*) as total_concepts,
  AVG(mastery_score) as avg_mastery,
  SUM(CASE WHEN mastery_score >= 0.85 THEN 1 ELSE 0 END) as mastered,
  SUM(CASE WHEN mastery_score < 0.5 THEN 1 ELSE 0 END) as needs_work
FROM vl_developer_profile;

-- Recent sessions
SELECT what_was_built, created_at
FROM vibelearn_session_summaries
ORDER BY created_at DESC
LIMIT 5;
SQL
```

### Step 3: Generate the Report

Write a report covering:

1. **Sessions Overview** — total sessions analyzed, date range
2. **Tech Stack** — frameworks and tools detected (from `vl_stack_profiles`)
3. **Concepts Encountered** — top categories and specific concepts
4. **Mastery Progress** — how many concepts mastered vs in progress
5. **Learning Gaps** — concepts with mastery_score < 0.5
6. **Quiz Stats** — questions answered, correct rate

### Step 4: Recommend Next Actions

Based on the data, suggest:
- `vl quiz` if pending questions exist
- `vl gaps` to focus on weak areas
- `vl login` if not connected to vibelearn.dev

## Notes

- All data is in `~/.vibelearn/vibelearn.db`
- The `vl` CLI provides interactive access: `vl quiz`, `vl status`, `vl gaps`
- Worker must be running on port **37778** (not 37777)
