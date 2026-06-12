# MEMORY_BANK.md — Project Memory Bank

## Purpose

Persistent project context for coding agents and contributors.

Use this file to store durable knowledge that should survive across tasks.

This file is not higher priority than `.agents/RULES.md` or `.agents/SKILL.md`.
Use it as working memory for architecture, domain, and operational context.

---

## How to Use

Update this file when you discover information that will help future work, such as:

- architecture decisions
- domain terms
- module boundaries
- recurring bugs
- validation expectations
- deployment notes
- migration constraints
- important file locations
- known tradeoffs

Keep entries short, factual, and easy to scan.

---

## Project Summary

```text
Name:
Type:
Primary stack:
Main modules:
```

---

## Architecture Notes

```text
- Database changes must be delivered only through ordered Supabase migration files in `supabase/migrations/`
- Do not use manual SQL as delivery path for project changes; local reset/push must work from migration history alone
- Every new migration version must be unique, sequential, and conflict-free before commit
```

---

## Domain Notes

```text
- <business rule>
- <domain term>
- <calculation rule>
- <approval rule>
```

---

## Important Paths

```text
- src/... : <purpose>
- supabase/... : <purpose>
- .agents/... : project guidance
```

---

## Validation Notes

```text
- lint: follow project lint rules when touching TS/TSX files
- typecheck: `npm run build`
- test: run relevant checks when available
- build: `npm run build`
- migrations: every DB change must be encoded in migration files and must be safe for `db push` / reset flows without manual SQL
```

---

## Known Issues

```text
- <issue>
- <scope>
- <workaround if any>
```

---

## Open Decisions

```text
- <decision to revisit>
- <options>
- <owner if known>
```

---

## Change Log for Memory

```text
- 2026-06-12: Project rule added — all database changes must use sequential migration files only; no manual SQL workflow allowed for delivered changes; migration history must stay reset/push safe.
```
