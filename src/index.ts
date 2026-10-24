import { swagger } from '@elysiajs/swagger';
import { createApp } from './app';
import { loadEnv } from './config/env';
import { createDatabase } from './db';
import {
  DrizzlePropertyRepository,
  InMemoryPropertyRepository,
} from './repositories/PropertyRepository';

const env = loadEnv();

const properties = env.DATABASE_URL
  ? new DrizzlePropertyRepository(createDatabase(env.DATABASE_URL))
  : new InMemoryPropertyRepository();

if (!env.DATABASE_URL) {
  console.warn('DATABASE_URL is not set: using the in-memory repository, data will not persist');
}

createApp({
  properties,
  corsOrigins: env.CORS_ALLOWED_ORIGINS.split(',').map((o) => o.trim()),
})
  .use(
    swagger({
      path: '/docs',
      documentation: {
        info: {
          title: 'defi-estate API',
          version: '0.1.0',
          description: 'Real estate tokenization and rental yield platform on Stellar',
        },
        tags: [
          { name: 'Health', description: 'Service health' },
          { name: 'Properties', description: 'Property listings and tokenization' },
        ],
      },
    }),
  )
  .listen(env.PORT);

console.info(`defi-estate API listening on http://localhost:${env.PORT} (docs at /docs)`);
