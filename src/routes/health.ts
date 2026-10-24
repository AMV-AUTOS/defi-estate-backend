import { Elysia } from 'elysia';
import { sql } from 'drizzle-orm';
import { db } from '../db';

export const healthRoutes = new Elysia()
  .get(
    '/health',
    () => ({ status: 'ok', timestamp: new Date().toISOString() }),
    { detail: { tags: ['Health'], summary: 'Liveness check' } },
  )
  .get(
    '/ready',
    async ({ set }) => {
      const timestamp = new Date().toISOString();

      if (!process.env.DATABASE_URL) {
        return {
          status: 'ready',
          database: 'skipped',
          timestamp,
        };
      }

      try {
        await db.execute(sql`SELECT 1`);
        return {
          status: 'ready',
          database: 'ok',
          timestamp,
        };
      } catch (error) {
        set.status = 503;
        return {
          status: 'unavailable',
          database: 'error',
          message: error instanceof Error ? error.message : 'Database unreachable',
          timestamp,
        };
      }
    },
    { detail: { tags: ['Health'], summary: 'Readiness check' } },
  );