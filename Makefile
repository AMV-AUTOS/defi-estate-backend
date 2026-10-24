# Run the same checks as CI before you push.

.PHONY: check fix help

help:
	@echo "make check   type-check, lint, prettier, test, build (same as CI)"
	@echo "make fix     prettier --write"

check:
	bun install --frozen-lockfile
	bun run type-check
	bun run lint
	bun run format:check
	bun test
	bun run build

fix:
	bun run format
