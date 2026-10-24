import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().url().optional(),
  CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
  STELLAR_NETWORK: z.enum(['testnet', 'mainnet']).default('testnet'),
  STELLAR_ADMIN_SECRET: z.string().min(1).optional(),
  STELLAR_RPC_URL: z.string().url().optional(),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(120),
});

export type ApiEnv = z.infer<typeof envSchema>;

const DEFAULT_RPC_URLS: Record<ApiEnv['STELLAR_NETWORK'], string> = {
  testnet: 'https://soroban-testnet.stellar.org',
  mainnet: 'https://soroban.stellar.org',
};

export function loadEnv(source: Record<string, string | undefined> = process.env): ApiEnv {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid API environment:\n${issues.join('\n')}`);
  }
  const data = parsed.data;
  return {
    ...data,
    STELLAR_RPC_URL: data.STELLAR_RPC_URL ?? DEFAULT_RPC_URLS[data.STELLAR_NETWORK],
  };
}