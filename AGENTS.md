# Agent Instructions

## Documentation lookup

Use Context7 MCP to fetch current documentation whenever work depends on library, framework, SDK, API, CLI tool, or cloud-service behavior. Prefer fetched documentation over memory for syntax, configuration, setup, migration, or library-specific debugging.

Do not use Context7 for refactoring, writing project-specific code from scratch, debugging business logic, code review, or general programming concepts.

## Agent skills

### Issue tracker

Issues and PRDs are tracked as local markdown files under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Triage labels

The repo uses the default five-state triage vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repo with root `CONTEXT.md` and root `docs/adr/`. See `docs/agents/domain.md`.
