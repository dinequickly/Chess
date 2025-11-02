# Repository Guidelines

## Project Structure & Module Organization
- `supabase/config.toml` holds local service ports, enabled runtimes, and shared env references; keep project overrides here rather than committing machine-specific edits elsewhere.
- `supabase/migrations/` contains ordered SQL snapshots (`00000000000000_initial_schema.sql`, dated diffs, and working copies). Commit only reviewed migrations and drop scratch files before pushing.
- Seed data lives alongside migrations (`seed.sql`, when present). Use it for deterministic fixtures.

## Build, Test, and Development Commands
- `supabase start`: spins up the full local stack (Postgres, Auth, Storage, Realtime, Studio). Run from repository root before exercising schema changes.
- `supabase db reset`: reapplies migrations and seeds against the local instance; use after editing SQL to verify clean-state reproducibility.
- `supabase db diff --linked --schema public`: creates a timestamped migration from linked remote changes; review and trim output before committing.
- `supabase migration new "short-description"`: scaffolds an empty migration file in `supabase/migrations/`; populate with reviewed SQL only.

## Coding Style & Naming Conventions
- SQL objects use `snake_case` (tables, columns, triggers). Functions and triggers should read as verbs (e.g., `update_study_set_card_count`).
- Group related DDL with explicit `CREATE EXTENSION` and `COMMENT ON` statements to preserve self-documenting schemas.
- Keep lines under 120 characters and align multi-line clauses; prefer `NOW()`/`uuid_generate_v4()` helpers over client-side defaults.

## Testing Guidelines
- Exercise migrations by running `supabase db reset` and inspecting resulting structures in Supabase Studio or via `psql`.
- Run `supabase db lint` to surface invalid references before review.
- When adding triggers or policies, include `SELECT` examples inside the migration as commented snippets showing expected behavior.

## Commit & Pull Request Guidelines
- Follow the existing history’s imperative, present-tense style (e.g., `Add Supabase schema and config`). Keep subject lines under 50 characters and omit trailing punctuation.
- Reference related issues with `Closes #123` in the body, include before/after notes for schema changes, and attach ERD snapshots or query plans when they clarify impact.
- Ensure pull requests summarize migration intent, expected data backfills, and manual steps (`supabase db reset`, environment variable changes) reviewers must perform.

## Security & Configuration Tips
- Never commit `.env` files or API keys. Use the `env(…)` indirection inside `supabase/config.toml` and document required variables in the pull request.
- Verify new storage buckets or auth providers stay disabled by default and document activation steps when promoting to other environments.
