# PostgreSQL Phase 1

This phase introduces a PostgreSQL foundation without forcing a risky all-at-once runtime cutover.

Implemented in this phase:

- Unified async DB client abstraction: `packages/application/src/db/client.ts`
- PostgreSQL pool client: `packages/application/src/db/postgres-client.ts`
- PostgreSQL migration runner: `packages/application/src/db/postgres-migrate.ts`
- Core task-chain schema migration:
  - `projects`
  - `analysis_tasks`
  - `task_inputs`
  - `sources`
  - `evidences`
  - `worker_jobs`
- Core repositories for:
  - recent task dedupe lookup
  - project creation
  - task creation
  - source insertion
  - evidence insertion
  - worker job enqueue
  - task list summary

Not switched yet in this phase:

- API runtime still uses the existing SQLite-backed implementation.
- Analysis / report / review tables and runtime flows are not yet moved to PostgreSQL.
- Community / onchain / factor detail read paths still use SQLite-specific access.

Why this staged approach:

- The repository has completed the runtime move to PostgreSQL; this note is kept only as migration history.
- PostgreSQL access is async, so a safe migration needs a repository boundary first.
- This phase creates that boundary for the highest-value task chain before the full runtime cutover.

Recommended next phase:

1. Replace the temporary runtime selector with PostgreSQL-only entrypoints.
2. Move intake / list / source / evidence / worker job API endpoints onto the new repositories.
3. Migrate analysis / report / review tables and queries.
4. Keep PostgreSQL as the only runtime database implementation.
