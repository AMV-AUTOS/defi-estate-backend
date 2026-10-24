# AGENTS.md

Read [CLAUDE.md](CLAUDE.md) first; it applies to every coding agent.

Before pushing:

1. `make check` passes.
2. `git diff` only touches files this change needs (no unrelated reformatting, lockfile churn or generated output).
3. New behavior has tests: `bun test`.
4. Docs in `docs/` are updated if behavior or architecture changed.
5. The commit message follows Conventional Commits.
