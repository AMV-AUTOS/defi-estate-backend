import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { errorHandler } from './middleware/errorHandler';
import { healthRoutes } from './routes/health';
import { propertyRoutes } from './routes/properties';
import type { PropertyRepository } from './repositories/PropertyRepository';

export interface AppDeps {
  properties: PropertyRepository;
  corsOrigins: string[];
}

/** Base app without swagger, so tests can import it cheaply. */
export function createApp({ properties, corsOrigins }: AppDeps) {
  return new Elysia()
    .use(cors({ origin: corsOrigins }))
    .use(errorHandler)
    .use(healthRoutes)
    .use(propertyRoutes(properties));
}
