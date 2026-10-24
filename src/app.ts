import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { rateLimit } from './middleware/rateLimit';
import { healthRoutes } from './routes/health';
import { propertyRoutes } from './routes/properties';
import { distributionRoutes } from './routes/distributions';
import type { PropertyRepository } from './repositories/PropertyRepository';
import type { StellarService } from './services/StellarService';
import type { DistributionService } from './services/DistributionService';

export interface AppDeps {
  properties: PropertyRepository;
  corsOrigins: string[];
  stellar?: StellarService;
  distributions?: DistributionService;
  rateLimitPerMinute?: number;
}

/** Base app without swagger, so tests can import it cheaply. */
export function createApp({
  properties,
  corsOrigins,
  stellar,
  distributions,
  rateLimitPerMinute,
}: AppDeps) {
  let app = new Elysia()
    .use(cors({ origin: corsOrigins }))
    .use(requestLogger)
    .use(rateLimit({ limitPerMinute: rateLimitPerMinute }))
    .use(errorHandler)
    .use(healthRoutes)
    .use(propertyRoutes(properties, stellar));

  if (distributions) {
    app = app.use(distributionRoutes(distributions));
  }

  return app;
}