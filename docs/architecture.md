# Architecture

```
            Investor browser                         Operator / admin
     (Next.js webapp + Freighter wallet)
          |                    |                            |
          | REST               | user-signed txs            | REST
          v                    v                            v
   +-------------+      +-----------------------------------------+
   |  backend    |----->|          Stellar / Soroban              |
   |  (Elysia)   | admin|  property-token      yield-distributor  |
   +-------------+ txs  +-----------------------------------------+
          |
          v
   PostgreSQL (Drizzle)   Redis (cache, jobs)
```

## Repositories

- **[defi-estate-frontend](https://github.com/defi-estate/defi-estate-frontend)**: Next.js App Router. Server components fetch from this API; client components handle wallet connection.
- **defi-estate-backend** (this repo): Elysia app built by `createApp(deps)` in `src/app.ts` so tests can inject an in-memory repository. Routes validate input with the zod schemas in `src/shared/schemas` and return the `ApiResponse<T>` envelope. Swagger is mounted at `/docs` in `src/index.ts`.
- **`src/shared`**: domain types, validation and the per-network contract registry. Mirrored in the frontend repo; keep both copies in sync.
- **[defi-estate-contract](https://github.com/defi-estate/defi-estate-contract)**: Soroban workspace with `property-token` and `yield-distributor`.

## Property lifecycle

1. Operator creates a property in the API (`draft`), then moves it to `pending_review`.
2. After review, the admin deploys a `property-token` for it with `max_supply = totalShares` and a `yield-distributor` bound to that token and the payout asset. The token's contract ID is saved on the property and its status set to `tokenized`.
3. Investors pass KYC; the admin whitelists their address on the token, then mints their purchased shares.
4. Each rental period the API snapshots holder balances, computes pro rata allocations and calls `distribute`. Holders call `claim` from the webapp.

## Signing model

| Action                       | Signed by       |
| ---------------------------- | --------------- |
| whitelist, mint, distribute  | API admin key   |
| transfer shares, claim yield | investor wallet |
