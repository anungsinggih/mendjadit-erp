# RULES.md — Project Global Rules

## Purpose

Project-wide non-negotiable rules for coding agents and contributors.

This file defines constraints and operating rules that should be followed before project-local skill preferences.

---

## Required Reading Order

Before major work, read:

```text
1. .agents/RULES.md
2. .agents/SKILL.md
3. .agents/MEMORY_BANK.md
```

---

## Core Rules

1. Read relevant files before editing.
2. Prefer smallest safe change.
3. Do not edit unrelated files.
4. Follow existing architecture and code patterns.
5. Do not introduce secrets into code or logs.
6. Do not claim success without verification.
7. Do not run destructive operations without explicit approval.
8. Do not overwrite user work without care.
9. Do not refactor broadly unless task requires it.
10. Do not change dependencies unless needed for task.

---

## File Change Rules

Agent should:

- prefer editing existing files over creating new ones
- create new files only when needed
- keep diffs small and reviewable
- avoid mass formatting
- avoid renaming or moving files unless required
- avoid deleting files without explicit reason

---

## Validation Rules

After code changes, run relevant validation for changed scope.

Preferred order:

```text
1. lint
2. typecheck
3. tests
4. build
```

If full validation is too heavy, run closest relevant validation and report what was not run.

---

## Safety Rules

Never do these without explicit user approval:

- delete data
- reset git history
- run destructive git commands
- drop tables or columns
- apply remote migrations
- deploy to production
- rotate or expose secrets

---

## Communication Rules

Responses should be:

- concise
- technical
- direct
- specific about files, commands, and errors

Avoid:

- fluff
- vague completion claims
- hidden assumptions

---

## Missing Context Rule

If task is ambiguous or repo lacks clear conventions:

1. inspect more files first,
2. infer from existing patterns,
3. note missing guidance,
4. recommend updating `.agents/` docs if useful.

---

## Documentation Rule

When architecture, workflow, or business rules become clearer during work, recommend updating:

- `.agents/SKILL.md`
- `.agents/RULES.md`
- `.agents/MEMORY_BANK.md`

Keep these files useful as long-term project guidance.