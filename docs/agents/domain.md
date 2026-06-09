# Domain Docs

How engineering skills should consume this repo's domain documentation when exploring the codebase.

## Layout

This is a single-context repo:

- `CONTEXT.md` at the repo root contains domain language.
- `docs/adr/` contains architectural decision records.
- `docs/specs/` contains product and implementation specifications.

## Before exploring, read these

- `CONTEXT.md`
- Relevant files under `docs/specs/`
- ADRs under `docs/adr/` that touch the area being changed

If any of these files do not exist yet, proceed silently.

## Use the glossary's vocabulary

When output names a domain concept, use the term defined in `CONTEXT.md`. Do not drift to synonyms that the glossary explicitly avoids.

## Flag ADR conflicts

If work contradicts an existing ADR, surface it explicitly rather than silently overriding it.
