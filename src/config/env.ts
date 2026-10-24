import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().url().optional(),
  CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
  STELLAR_NETWORK: z.enum(['testnet', 'mainnet']).default('testnet'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters long'),
  OPERATOR_PUBLIC_KEY: z
    .string()
    .regex(/^G[A-Z2-7]{55}$/, 'OPERATOR_PUBLIC_KEY must be a valid Stellar public key')
    .optional(),
});

export type ApiEnv = z.infer<typeof envSchema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): ApiEnv {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid API environment:\n${issues.join('\n')}`);
  }
  return parsed.data;
}
```

.env.example:

```
# API
PORT=3001
DATABASE_URL=postgres://postgres:postgres@localhost:5432/stellar_estate
CORS_ALLOWED_ORIGINS=http://localhost:3000
STELLAR_NETWORK=testnet

# Auth
# Secret used to sign JWT session tokens. Must be at least 32 characters.
JWT_SECRET=change-me-to-a-long-random-secret-value

# Operator seed
# Stellar public key of the first operator account created by the seed script.
OPERATOR_PUBLIC_KEY=GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF