import { Elysia, t } from 'elysia';
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
import type { KycRepository } from '../repositories/KycRepository';
import type { TransactionRepository } from '../repositories/TransactionRepository';
import type { StellarService } from '../services/StellarService';

const ok = <T>(data: T): ApiSuccess<T> => ({ success: true, data });

const whitelistBodySchema = t.Object({
  investorId: t.String({ minLength: 1 }),
  walletAddress: t.String({ minLength: 1 }),
});

const mintBodySchema = t.Object({
  investorId: t.String({ minLength: 1 }),
  walletAddress: t.String({ minLength: 1 }),
  amount: t.String({ minLength: 1 }),
});

export interface PropertyRouteDeps {
  repo: PropertyRepository;
  kycRepo: KycRepository;
  txRepo: TransactionRepository;
  stellar: StellarService;
}

export function propertyRoutes({ repo, kycRepo, txRepo, stellar }: PropertyRouteDeps) {
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
    )
    .post(
      '/:id/whitelist',
      async ({ params, body, set }) => {
        const property = await repo.get(params.id);
        if (!property) throw new HttpError(404, 'PROPERTY_NOT_FOUND', 'Property not found');
        if (!property.tokenContractId) {
          throw new HttpError(409, 'PROPERTY_NOT_TOKENIZED', 'Property has no token contract');
        }

        const kyc = await kycRepo.getByInvestor(body.investorId);
        if (!kyc || kyc.status !== 'approved') {
          throw new HttpError(403, 'KYC_NOT_APPROVED', 'Investor KYC is not approved');
        }

        const result = await stellar.setWhitelisted({
          contractId: property.tokenContractId,
          walletAddress: body.walletAddress,
        });

        const record = await txRepo.create({
          propertyId: property.id,
          investorId: body.investorId,
          type: 'whitelist',
          txHash: result.txHash,
          status: result.status,
          result: result.result,
        });

        set.status = 201;
        return ok(record);
      },
      {
        body: whitelistBodySchema,
        detail: { summary: 'Whitelist an investor on the property token (operator only)' },
      },
    )
    .post(
      '/:id/mint',
      async ({ params, body, set }) => {
        const property = await repo.get(params.id);
        if (!property) throw new HttpError(404, 'PROPERTY_NOT_FOUND', 'Property not found');
        if (!property.tokenContractId) {
          throw new HttpError(409, 'PROPERTY_NOT_TOKENIZED', 'Property has no token contract');
        }

        const kyc = await kycRepo.getByInvestor(body.investorId);
        if (!kyc || kyc.status !== 'approved') {
          throw new HttpError(403, 'KYC_NOT_APPROVED', 'Investor KYC is not approved');
        }

        const result = await stellar.mint({
          contractId: property.tokenContractId,
          walletAddress: body.walletAddress,
          amount: body.amount,
        });

        const record = await txRepo.create({
          propertyId: property.id,
          investorId: body.investorId,
          type: 'mint',
          txHash: result.txHash,
          status: result.status,
          result: result.result,
        });

        set.status = 201;
        return ok(record);
      },
      {
        body: mintBodySchema,
        detail: { summary: 'Mint property tokens to an investor (operator only)' },
      },
    );
}
