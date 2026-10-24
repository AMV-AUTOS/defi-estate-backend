# CLAUDE.md

Guidance for Claude Code (and other agents) working in this repository.

## What this is

The defi-estate REST API (Elysia on Bun, Drizzle on PostgreSQL). It holds the Stellar admin key for admin-signed contract calls (whitelist, mint, distribute) against the contracts in `defi-estate-contract`, and serves property data to `defi-estate-frontend`.

## Non-negotiables

- **`make check` must pass** before work is called done (type-check, lint, prettier, tests, build).
- Validate every request body and query with a zod schema from `src/shared/schemas` and return the `ApiResponse<T>` envelope. Throw `HttpError` for expected failures.
- Routes depend on repository interfaces, not on Drizzle directly, so tests can use the in-memory repository.
- Schema changes go through `src/db/schema.ts` plus a generated migration in `drizzle/`.
- **`src/shared` is mirrored in `defi-estate-frontend`.** When you change a type, schema or contract ID there, make the same change in the frontend repo.
- **Contract IDs are data**: record deployments in `src/shared/contracts/contracts.<network>.json`, never in code.
- Never commit `.env` files or `STELLAR_ADMIN_SECRET`.

## Commit conventions

Conventional Commits: `<type>(<scope>): <short lowercase summary>`. Scopes: `properties`, `db`, `shared`, `ci`, `docs`.
