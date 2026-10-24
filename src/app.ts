import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { errorHandler } from './middleware/errorHandler';
import { healthRoutes } from './routes/health';
import { propertyRoutes } from './routes/properties';
import { kycRoutes } from './routes/kyc';
import type { PropertyRepository } from './repositories/PropertyRepository';
import type { KycRepository } from './repositories/KycRepository';

export interface AppDeps {
  properties: PropertyRepository;
  kyc: KycRepository;
  corsOrigins: string[];
}

/** Base app without swagger, so tests can import it cheaply. */
export function createApp({ properties, kyc, corsOrigins }: AppDeps) {
  return new Elysia()
    .use(cors({ origin: corsOrigins }))
    .use(errorHandler)
    .use(healthRoutes)
    .use(propertyRoutes(properties))
    .use(kycRoutes({ kyc }));
}