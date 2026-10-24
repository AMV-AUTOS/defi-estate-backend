import { beforeEach, describe, expect, it } from 'bun:test';
import type { Paginated, Property } from '../src/shared';
import { createApp } from '../src/app';
import { InMemoryPropertyRepository } from '../src/repositories/PropertyRepository';
import type { StellarService } from '../src/services/StellarService';
import type { DistributionService } from '../src/services/DistributionService';

const payload = {
  name: 'Lekki Garden Apartments',
  type: 'residential',
  location: { address: '12 Admiralty Way', city: 'Lagos', country: 'NG' },
  valuationUsdCents: 50_000_000,
  totalShares: 10_000,
  expectedYieldBps: 750,
};

type Envelope = {
  status?: string;
  data: Property & Paginated<Property>;
  error: { code: string };
};

const read = (res: Response) => res.json() as Promise<Envelope>;

function json(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function fakeStellar() {
  const calls: { method: string; args: unknown[] }[] = [];
  const service = {
    setWhitelisted: async (...args: unknown[]) => {
      calls.push({ method: 'setWhitelisted', args });
      return { hash: 'whitelist-hash', status: 'SUCCESS' };
    },
    mint: async (...args: unknown[]) => {
      calls.push({ method: 'mint', args });
      return { hash: 'mint-hash', status: 'SUCCESS' };
    },
    distribute: async (...args: unknown[]) => {
      calls.push({ method: 'distribute', args });
      return { hash: 'distribute-hash', status: 'SUCCESS' };
    },
  } as unknown as StellarService;
  return { service, calls };
}

function fakeDistributions() {
  const calls: unknown[][] = [];
  const service = {
    createDistribution: async (...args: unknown[]) => {
      calls.push(args);
      return { id: 'dist-1', batches: [{ hash: 'distribute-hash', status: 'SUCCESS' }] };
    },
  } as unknown as DistributionService;
  return { service, calls };
}

describe('properties API', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = createApp({ properties: new InMemoryPropertyRepository(), corsOrigins: ['*'] });
  });

  it('reports health', async () => {
    const res = await app.handle(new Request('http://localhost/health'));
    expect(res.status).toBe(200);
    expect((await read(res)).status).toBe('ok');
  });

  it('creates a property and derives the share price', async () => {
    const res = await app.handle(json('POST', '/properties', payload));
    expect(res.status).toBe(201);
    const { data } = await read(res);
    expect(data.status).toBe('draft');
    expect(data.sharePriceUsdCents).toBe(5_000);
  });

  it('rejects an invalid property', async () => {
    const res = await app.handle(json('POST', '/properties', { ...payload, totalShares: -1 }));
    expect(res.status).toBe(400);
    expect((await read(res)).error.code).toBe('VALIDATION_ERROR');
  });

  it('lists, fetches and updates properties', async () => {
    const created = (await read(await app.handle(json('POST', '/properties', payload)))).data;

    const list = await read(await app.handle(json('GET', '/properties?pageSize=5')));
    expect(list.data.total).toBe(1);
    expect(list.data.pageSize).toBe(5);

    const updated = await app.handle(
      json('PATCH', `/properties/${created.id}`, { totalShares: 20_000, status: 'pending_review' }),
    );
    const { data } = await read(updated);
    expect(data.sharePriceUsdCents).toBe(2_500);
    expect(data.status).toBe('pending_review');
  });

  it('returns 404 for an unknown property', async () => {
    const res = await app.handle(json('GET', `/properties/${crypto.randomUUID()}`));
    expect(res.status).toBe(404);
    expect((await read(res)).error.code).toBe('PROPERTY_NOT_FOUND');
  });
});

describe('request logging and rate limiting', () => {
  it('sets an x-request-id header when none is provided', async () => {
    const app = createApp({ properties: new InMemoryPropertyRepository(), corsOrigins: ['*'] });
    const res = await app.handle(new Request('http://localhost/health'));
    expect(res.headers.get('x-request-id')).toBeTruthy();
  });

  it('reuses an incoming x-request-id', async () => {
    const app = createApp({ properties: new InMemoryPropertyRepository(), corsOrigins: ['*'] });
    const res = await app.handle(
      new Request('http://localhost/health', { headers: { 'x-request-id': 'abc-123' } }),
    );
    expect(res.headers.get('x-request-id')).toBe('abc-123');
  });

  it('returns 429 with the standard error envelope once the limit is exceeded', async () => {
    const app = createApp({
      properties: new InMemoryPropertyRepository(),
      corsOrigins: ['*'],
      rateLimitPerMinute: 2,
    });
    const first = await app.handle(json('GET', '/properties'));
    const second = await app.handle(json('GET', '/properties'));
    const third = await app.handle(json('GET', '/properties'));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(429);
    const body = await read(third);
    expect(body.error.code).toBe('RATE_LIMITED');
  });

  it('leaves /health out of rate limiting', async () => {
    const app = createApp({
      properties: new InMemoryPropertyRepository(),
      corsOrigins: ['*'],
      rateLimitPerMinute: 1,
    });
    for (let i = 0; i < 5; i += 1) {
      const res = await app.handle(new Request('http://localhost/health'));
      expect(res.status).toBe(200);
    }
  });
});

describe('whitelist and mint routes', () => {
  let app: ReturnType<typeof createApp>;
  let stellar: ReturnType<typeof fakeStellar>;
  let propertyId: string;

  beforeEach(async () => {
    stellar = fakeStellar();
    app = createApp({
      properties: new InMemoryPropertyRepository(),
      corsOrigins: ['*'],
      stellar: stellar.service,
    });
    const created = await read(await app.handle(json('POST', '/properties', payload)));
    propertyId = created.data.id;
  });

  it('whitelists an approved investor and stores the transaction hash', async () => {
    const res = await app.handle(
      json('POST', `/properties/${propertyId}/whitelist`, {
        address: 'GABC',
        kycStatus: 'approved',
      }),
    );
    expect(res.status).toBe(200);
    const { data } = await read(res);
    expect(data.txHash).toBe('whitelist-hash');
    expect(stellar.calls[0]?.method).toBe('setWhitelisted');
  });

  it('rejects whitelisting an investor whose KYC is not approved', async () => {
    const res = await app.handle(
      json('POST', `/properties/${propertyId}/whitelist`, {
        address: 'GABC',
        kycStatus: 'pending',
      }),
    );
    expect(res.status).toBe(403);
    expect((await read(res)).error.code).toBe('KYC_NOT_APPROVED');
    expect(stellar.calls).toHaveLength(0);
  });

  it('mints shares and stores the transaction hash', async () => {
    const res = await app.handle(
      json('POST', `/properties/${propertyId}/mint`, { address: 'GABC', amount: 100 }),
    );
    expect(res.status).toBe(200);
    const { data } = await read(res);
    expect(data.txHash).toBe('mint-hash');
    expect(stellar.calls[0]?.method).toBe('mint');
  });
});

describe('distributions route', () => {
  it('submits a distribution and returns the batch results', async () => {
    const distributions = fakeDistributions();
    const app = createApp({
      properties: new InMemoryPropertyRepository(),
      corsOrigins: ['*'],
      distributions: distributions.service,
    });
    const created = await read(await app.handle(json('POST', '/properties', payload)));
    const res = await app.handle(
      json('POST', `/properties/${created.data.id}/distributions`, {
        period: '2024-01',
        grossAmount: 1_000_000,
      }),
    );
    expect(res.status).toBe(200);
    const { data } = await read(res);
    expect(data.id).toBe('dist-1');
    expect(distributions.calls).toHaveLength(1);
  });
});
