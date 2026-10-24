# Contributing

1. Fork the repository and branch from `develop`: `feat/<name>`, `fix/<name>`, `docs/<name>`.
2. One logical change per commit, using [Conventional Commits](https://www.conventionalcommits.org/).
3. Run `make check` and make sure it passes.
4. Open a pull request against `develop` using the PR template.

CI (`.github/workflows/ci.yml`) runs type-check, ESLint, Prettier, `bun test` and the production build.

Never commit `.env` files or secret keys. Report vulnerabilities privately to the maintainers.
