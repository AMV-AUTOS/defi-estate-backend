import { Elysia } from 'elysia';
import {
  createPropertySchema,
  paginationSchema,
  updatePropertySchema,
  type ApiSuccess,
  type Paginated,
  type Property,
} from '../shared';
import { HttpError } from '../middleware/errorHandler';
import type { PropertyRepository } from '../repositories/PropertyRepository';

const ok = <T>(data: T): ApiSuccess<T> => ({ success: true, data });

export function propertyRoutes(repo: PropertyRepository) {
  return new Elysia({ prefix: '/properties', detail: { tags: ['Properties'] } })
    .get(
      '/',
      async ({ query }): Promise<ApiSuccess<Paginated<Property>>> =>
        ok(await repo.list(paginationSchema.parse(query))),
      { detail: { summary: 'List properties' } },
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
      { detail: { summary: 'Create a property (draft)' } },
    )
    .patch(
      '/:id',
      async ({ params, body }) => {
        const property = await repo.update(params.id, updatePropertySchema.parse(body));
        if (!property) throw new HttpError(404, 'PROPERTY_NOT_FOUND', 'Property not found');
        return ok(property);
      },
      { detail: { summary: 'Update a property' } },
    );
}
