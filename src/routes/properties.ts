import { Elysia } from 'elysia';
import {
  allowedTransitions,
  createPropertySchema,
  propertyQuerySchema,
  updatePropertySchema,
  type ApiSuccess,
  type Paginated,
  type Property,
  type PropertyStatus,
} from '../shared';
import { HttpError } from '../middleware/errorHandler';
import { authPlugin, requireRole } from '../middleware/auth';
import type { PropertyRepository } from '../repositories/PropertyRepository';

const ok = <T>(data: T): ApiSuccess<T> => ({ success: true, data });

function assertValidTransition(current: PropertyStatus, next: PropertyStatus, tokenContractId?: string | null) {
  if (current === next) return;
  if (!allowedTransitions[current]?.includes(next)) {
    throw new HttpError(
      409,
      'INVALID_STATUS_TRANSITION',
      `Cannot transition property status from '${current}' to '${next}'`,
    );
  }
  if (next === 'tokenized' && !tokenContractId) {
    throw new HttpError(
      409,
      'INVALID_STATUS_TRANSITION',
      'tokenContractId is required when moving a property to tokenized',
    );
  }
}

export function propertyRoutes(repo: PropertyRepository) {
  return new Elysia({ prefix: '/properties', detail: { tags: ['Properties'] } })
    .use(authPlugin)
    .get(
      '/',
      async ({ query }): Promise<ApiSuccess<Paginated<Property>>> =>
        ok(await repo.list(propertyQuerySchema.parse(query))),
      {
        detail: {
          summary: 'List properties',
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1 } },
            { name: 'city', in: 'query', schema: { type: 'string' } },
            { name: 'country', in: 'query', schema: { type: 'string' } },
            { name: 'type', in: 'query', schema: { type: 'string' } },
            { name: 'status', in: 'query', schema: { type: 'string' } },
            { name: 'minYield', in: 'query', schema: { type: 'number' } },
            { name: 'sort', in: 'query', schema: { type: 'string', enum: ['yield_desc', 'newest'] } },
          ],
        },
      },
    )
    .get(
      '/:id',
      async ({ params }) => {
        const property = await repo.get(params.id);
        if (!property) throw new HttpError(404, 'PROPERTY_NOT_FOUND', 'Property not found');
        return ok(property);
      },
      { detail: { summary: 'Get a property' } },
    )
    .post(
      '/',
      async ({ body, set }) => {
        const property = await repo.create(createPropertySchema.parse(body));
        set.status = 201;
        return ok(property);
      },
      {
        beforeHandle: requireRole('operator'),
        detail: { summary: 'Create a property (draft)' },
      },
    )
    .patch(
      '/:id',
      async ({ params, body }) => {
        const input = updatePropertySchema.parse(body);
        const existing = await repo.get(params.id);
        if (!existing) throw new HttpError(404, 'PROPERTY_NOT_FOUND', 'Property not found');
        if (input.status) {
          assertValidTransition(
            existing.status,
            input.status,
            input.tokenContractId ?? existing.tokenContractId,
          );
        }
        const property = await repo.update(params.id, input);
        if (!property) throw new HttpError(404, 'PROPERTY_NOT_FOUND', 'Property not found');
        return ok(property);
      },
      {
        beforeHandle: requireRole('operator'),
        detail: { summary: 'Update a property' },
      },
    );
}
