# SKILL.md — Project Execution Skill

## Purpose

Project-local execution guide for Cline and other coding agents.

Use this file to define how work should be done inside this repository.

This file should be read together with:

- `.agents/RULES.md`
- `.agents/MEMORY_BANK.md`

Priority inside project:

```text
1. .agents/RULES.md
2. .agents/SKILL.md
3. .agents/MEMORY_BANK.md
4. Existing code patterns
```

---

## Default Workflow

For normal coding tasks, follow this order:

```text
1. Read `.agents/RULES.md`
2. Read `.agents/MEMORY_BANK.md`
3. Inspect relevant files before editing
4. Keep changes small and scoped
5. Follow existing architecture and naming patterns
6. Validate after changes
7. Report summary, files changed, and validation result
```

---

## Work Style

Agent should:

- inspect before edit
- prefer targeted diffs
- avoid unrelated file changes
- preserve current architecture unless task requires change
- avoid mass formatting unless asked
- avoid dependency changes unless needed
- avoid changing tests unless task requires it
- avoid fake completion claims

---

## Module-First Rule

If task is large, split by module and finish one module at a time.

Suggested order:

```text
1. Contract / type / schema
2. Service / backend logic
3. UI integration
4. Validation
5. Verification
```

Do not jump across unrelated modules without reason.

---

## Validation Rule

After edits, run relevant validation available in project.

Typical priority:

```text
npm run lint
npm run typecheck
npm run test
npm run build
```

If some commands do not exist, use closest available scripts.

If validation fails:

1. read exact error,
2. fix task-related issue,
3. rerun validation,
4. report unrelated existing issues separately.

---

## Communication Rule

Keep responses short, technical, and direct.

Preferred final format:

```text
Done.

Summary:
- ...

Files changed:
- ...

Validation:
- ...

Notes:
- ...
```

If blocked:

```text
Partial completion.

Completed:
- ...

Blocked by:
- ...

Recommended next step:
- ...
```

---

## Recommended Use

Update this file when project needs custom workflow such as:

- module boundaries
- naming conventions
- deployment flow
- migration process
- testing expectations
- review checklist