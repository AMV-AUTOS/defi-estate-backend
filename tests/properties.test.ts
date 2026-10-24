import { beforeEach, describe, expect, it } from 'bun:test';
import { Keypair } from '@stellar/stellar-sdk';
import type { KycSubmission, Paginated, Property } from '../src/shared';
import { createApp } from '../src/app';
import { InMemoryPropertyRepository } from '../src/repositories/PropertyRepository';
import { InMemoryAuthRepository } from '../src/repositories/AuthRepository';
import { InMemoryKycRepository } from '../src/repositories/KycRepository';

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

type AuthEnvelope = {
  data: { challenge?: string; nonce?: string; token?: string };
  error: { code: string };
};

const read = (res: Response) => res.json() as Promise<Envelope>;
const readAuth = (res: Response) => res.json() as Promise<AuthEnvelope>;

function json(method: string, path: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request(`http://localhost${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function signIn(app: ReturnType<typeof createApp>, keypair: Keypair): Promise<string> {
  const challengeRes = await app.handle(
    json('POST', '/auth/challenge', { publicKey: keypair.publicKey() }),
  );
  const challenge = (await readAuth(challengeRes)).data;
  const signature = keypair.sign(Buffer.from(challenge.challenge ?? challenge.nonce ?? '')).toString('base64');
  const verifyRes = await app.handle(
    json('POST', '/auth/verify', {
      publicKey: keypair.publicKey(),
      nonce: challenge.nonce,
      signature,
    }),
  );
  return (await readAuth(verifyRes)).data.token as string;
}

describe('properties API', () => {
  let app: ReturnType<typeof createApp>;
  let operator: Keypair;
  let investor: Keypair;
  let operatorToken: string;
  let investorToken: string;

  beforeEach(async () => {
    operator = Keypair.random();
    investor = Keypair.random();
    const auth = new InMemoryAuthRepository();
    auth.seedUser({ publicKey: operator.publicKey(), role: 'operator' });
    auth.seedUser({ publicKey: investor.publicKey(), role: 'investor' });
    app = createApp({
      properties: new InMemoryPropertyRepository(),
      auth,
      corsOrigins: ['*'],
      jwtSecret: 'test-secret',
    });
    operatorToken = await signIn(app, operator);
    investorToken = await signIn(app, investor);
  });

  it('reports health', async () => {
    const res = await app.handle(new Request('http://localhost/health'));
    expect(res.status).toBe(200);
    expect((await read(res)).status).toBe('ok');
  });

  it('creates a property and derives the share price', async () => {
    const res = await app.handle(json('POST', '/properties', payload, operatorToken));
    expect(res.status).toBe(201);
    const { data } = await read(res);
    expect(data.status).toBe('draft');
    expect(data.sharePriceUsdCents).toBe(5_000);
  });

  it('rejects an invalid property', async () => {
    const res = await app.handle(
      json('POST', '/properties', { ...payload, totalShares: -1 }, operatorToken),
    );
    expect(res.status).toBe(400);
    expect((await read(res)).error.code).toBe('VALIDATION_ERROR');
  });

  it('lists, fetches and updates properties', async () => {
    const created = (
      await read(await app.handle(json('POST', '/properties', payload, operatorToken)))
    ).data;

    const list = await read(await app.handle(json('GET', '/properties?pageSize=5')));
    expect(list.data.total).toBe(1);
    expect(list.data.pageSize).toBe(5);

    const updated = await app.handle(
      json(
        'PATCH',
        `/properties/${created.id}`,
        { totalShares: 20_000, status: 'pending_review' },
        operatorToken,
      ),
    );
    const { data } = await read(updated);
    expect(data.sharePriceUsdCents).toBe(2_500);
    expect(data.status).toBe('pending_review');
  });

  it('rejects anonymous writes', async () => {
    const create = await app.handle(json('POST', '/properties', payload));
    expect(create.status).toBe(401);

    const created = (
      await read(await app.handle(json('POST', '/properties', payload, operatorToken)))
    ).data;
    const patch = await app.handle(
      json('PATCH', `/properties/${created.id}`, { totalShares: 20_000 }),
    );
    expect(patch.status).toBe(401);
  });

  it('forbids investor writes', async () => {
    const create = await app.handle(json('POST', '/properties', payload, investorToken));
    expect(create.status).toBe(403);

    const created = (
      await read(await app.handle(json('POST', '/properties', payload, operatorToken)))
    ).data;
    const patch = await app.handle(
      json('PATCH', `/properties/${created.id}`, { totalShares: 20_000 }, investorToken),
    );
    expect(patch.status).toBe(403);
  });

  it('allows operator writes', async () => {
    const create = await app.handle(json('POST', '/properties', payload, operatorToken));
    expect(create.status).toBe(201);
    const created = (await read(create)).data;

    const patch = await app.handle(
      json('PATCH', `/properties/${created.id}`, { totalShares: 20_000 }, operatorToken),
    );
    expect(patch.status).toBe(200);
  });

  it('allows every valid status transition', async () => {
    const created = (
      await read(await app.handle(json('POST', '/properties', payload, operatorToken)))
    ).data;

    const draftToReview = await app.handle(
      json('PATCH', `/properties/${created.id}`, { status: 'pending_review' }, operatorToken),
    );
    expect(draftToReview.status).toBe(200);

    const reviewToDraft = await app.handle(
      json('PATCH', `/properties/${created.id}`, { status: 'draft' }, operatorToken),
    );
    expect(reviewToDraft.status).toBe(200);

    await app.handle(
      json('PATCH', `/properties/${created.id}`, { status: 'pending_review' }, operatorToken),
    );
    const reviewToTokenized = await app.handle(
      json(
        'PATCH',
        `/properties/${created.id}`,
        { status: 'tokenized', tokenContractId: 'CABC123' },
        operatorToken,
      ),
    );
    expect(reviewToTokenized.status).toBe(200);

    const tokenizedToArchived = await app.handle(
      json('PATCH', `/properties/${created.id}`, { status: 'archived' }, operatorToken),
    );
    expect(tokenizedToArchived.status).toBe(200);
  });

  it('rejects forbidden status transitions', async () => {
    const created = (
      await read(await app.handle(json('POST', '/properties', payload, operatorToken)))
    ).data;

    const draftToTokenized = await app.handle(
      json(
        'PATCH',
        `/properties/${created.id}`,
        { status: 'tokenized', tokenContractId: 'CABC123' },
        operatorToken,
      ),
    );
    expect(draftToTokenized.status).toBe(409);
    expect((await read(draftToTokenized)).error.code).toBe('INVALID_STATUS_TRANSITION');

    const draftToArchived = await app.handle(
      json('PATCH', `/properties/${created.id}`, { status: 'archived' }, operatorToken),
    );
    expect(draftToArchived.status).toBe(409);

    await app.handle(
      json('PATCH', `/properties/${created.id}`, { status: 'pending_review' }, operatorToken),
    );
    const reviewToArchived = await app.handle(
      json('PATCH', `/properties/${created.id}`, { status: 'archived' }, operatorToken),
    );
    expect(reviewToArchived.status).toBe(409);
  });

  it('requires a token contract when tokenizing', async () => {
    const created = (
      await read(await app.handle(json('POST', '/properties', payload, operatorToken)))
    ).data;
    await app.handle(
      json('PATCH', `/properties/${created.id}`, { status: 'pending_review' }, operatorToken),
    );

    const res = await app.handle(
      json('PATCH', `/properties/${created.id}`, { status: 'tokenized' }, operatorToken),
    );
    expect(res.status).toBe(400);
    expect((await read(res)).error.code).toBe('VALIDATION_ERROR');
  });

  it('filters the property list', async () => {
    await app.handle(
      json(
        'POST',
        '/properties',
        { ...payload, name: 'Lagos One', location: { address: 'A', city: 'Lagos', country: 'NG' } },
        operatorToken,
      ),
    );
    await app.handle(
      json(
        'POST',
        '/properties',
        {
          ...payload,
          name: 'Nairobi Two',
          type: 'commercial',
          expectedYieldBps: 900,
          location: { address: 'B', city: 'Nairobi', country: 'KE' },
        },
        operatorToken,
      ),
    );

    const byCity = await read(await app.handle(json('GET', '/properties?city=Lagos')));
    expect(byCity.data.total).toBe(1);

    const byCountry = await read(await app.handle(json('GET', '/properties?country=KE')));
    expect(byCountry.data.total).toBe(1);

    const byType = await read(await app.handle(json('GET', '/properties?type=commercial')));
    expect(byType.data.total).toBe(1);

    const byStatus = await read(await app.handle(json('GET', '/properties?status=draft')));
    expect(byStatus.data.total).toBe(2);

    const byYield = await read(await app.handle(json('GET', '/properties?minYieldBps=800')));
    expect(byYield.data.total).toBe(1);

    const combined = await read(
      await app.handle(json('GET', '/properties?city=Lagos&type=residential')),
    );
    expect(combined.data.total).toBe(1);
  });

  it('sorts the property list', async () => {
    await app.handle(
      json('POST', '/properties', { ...payload, expectedYieldBps: 500 }, operatorToken),
    );
    await app.handle(
      json('POST', '/properties', { ...payload, expectedYieldBps: 900 }, operatorToken),
    );

    const byYield = await read(await app.handle(json('GET', '/properties?sort=yield_desc')));
    expect(byYield.data.items[0]?.expectedYieldBps).toBe(900);

    const newest = await read(await app.handle(json('GET', '/properties?sort=newest')));
    expect(newest.data.items).toHaveLength(2);
  });

  it('rejects invalid query values', async () => {
    const res = await app.handle(json('GET', '/properties?sort=bogus'));
    expect(res.status).toBe(400);
    expect((await read(res)).error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 for an unknown property', async () => {
    const res = await app.handle(json('GET', `/properties/${crypto.randomUUID()}`));
    expect(res.status).toBe(404);
    expect((await read(res)).error.code).toBe('PROPERTY_NOT_FOUND');
  });
});

describe('auth API', () => {
  let app: ReturnType<typeof createApp>;
  let auth: InMemoryAuthRepository;

  beforeEach(() => {
    auth = new InMemoryAuthRepository();
    app = createApp({
      properties: new InMemoryPropertyRepository(),
      auth,
      corsOrigins: ['*'],
      jwtSecret: 'test-secret',
    });
  });

  it('issues a challenge for a public key', async () => {
    const keypair = Keypair.random();
    const res = await app.handle(json('POST', '/auth/challenge', { publicKey: keypair.publicKey() }));
    expect(res.status).toBe(200);
    const { data } = await readAuth(res);
    expect(data.challenge ?? data.nonce).toBeTruthy();
  });

  it('verifies a valid signature', async () => {
    const keypair = Keypair.random();
    const challenge = (
      await readAuth(
        await app.handle(json('POST', '/auth/challenge', { publicKey: keypair.publicKey() })),
      )
    ).data;
    const signature = keypair
      .sign(Buffer.from(challenge.challenge ?? challenge.nonce ?? ''))
      .toString('base64');

    const res = await app.handle(
      json('POST', '/auth/verify', {
        publicKey: keypair.publicKey(),
        nonce: challenge.nonce,
        signature,
      }),
    );
    expect(res.status).toBe(200);
    expect((await readAuth(res)).data.token).toBeTruthy();
  });

  it('rejects a wrong signature', async () => {
    const keypair = Keypair.random();
    const other = Keypair.random();
    const challenge = (
      await readAuth(
        await app.handle(json('POST', '/auth/challenge', { publicKey: keypair.publicKey() })),
      )
    ).data;
    const signature = other
      .sign(Buffer.from(challenge.challenge ?? challenge.nonce ?? ''))
      .toString('base64');

    const res = await app.handle(
      json('POST', '/auth/verify', {
        publicKey: keypair.publicKey(),
        nonce: challenge.nonce,
        signature,
      }),
    );
    expect(res.status).toBe(401);
  });

  it('rejects an expired challenge', async () => {
    const keypair = Keypair.random();
    const challenge = (
      await readAuth(
        await app.handle(json('POST', '/auth/challenge', { publicKey: keypair.publicKey() })),
      )
    ).data;
    const signature = keypair
      .sign(Buffer.from(challenge.challenge ?? challenge.nonce ?? ''))
      .toString('base64');

    auth.expireChallenges();

    const res = await app.handle(
      json('POST', '/auth/verify', {
        publicKey: keypair.publicKey(),
        nonce: challenge.nonce,
        signature,
      }),
    );
    expect(res.status).toBe(401);
  });

  it('rejects a reused nonce', async () => {
    const keypair = Keypair.random();
    const challenge = (
      await readAuth(
        await app.handle(json('POST', '/auth/challenge', { publicKey: keypair.publicKey() })),
      )
    ).data;
    const signature = keypair
      .sign(Buffer.from(challenge.challenge ?? challenge.nonce ?? ''))
      .toString('base64');

    const body = {
      publicKey: keypair.publicKey(),
      nonce: challenge.nonce,
      signature,
    };
    const first = await app.handle(json('POST', '/auth/verify', body));
    expect(first.status).toBe(200);

    const second = await app.handle(json('POST', '/auth/verify', body));
    expect(second.status).toBe(401);
  });
});

type KycEnvelope = {
  status?: string;
  data: KycSubmission & Paginated<KycSubmission>;
  error: { code: string };
};

const readKyc = (res: Response) => res.json() as Promise<KycEnvelope>;

function kycRequest(method: string, path: string, role: string, body?: unknown) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-user-role': role },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('kyc API', () => {
  let app: ReturnType<typeof createApp>;
  let kyc: InMemoryKycRepository;

  beforeEach(() => {
    kyc = new InMemoryKycRepository();
    app = createApp({
      properties: new InMemoryPropertyRepository(),
      kyc,
      corsOrigins: ['*'],
    });
  });

  it('lets an investor submit a KYC record that starts pending', async () => {
    const res = await app.handle(
      kycRequest('POST', '/kyc', 'investor', { notes: 'Passport attached' }),
    );
    expect(res.status).toBe(201);
    const { data } = await readKyc(res);
    expect(data.status).toBe('pending');
    expect(data.reviewedBy).toBeNull();
    expect(data.reviewedAt).toBeNull();
  });

  it('lists pending submissions for operators', async () => {
    await app.handle(kycRequest('POST', '/kyc', 'investor', {}));
    const res = await app.handle(kycRequest('GET', '/kyc?status=pending', 'operator'));
    expect(res.status).toBe(200);
    const { data } = await readKyc(res);
    expect(data.total).toBe(1);
    expect(data.items[0]?.status).toBe('pending');
  });

  it('approves a submission and writes an audit log entry', async () => {
    const created = (
      await readKyc(await app.handle(kycRequest('POST', '/kyc', 'investor', {})))
    ).data;

    const res = await app.handle(
      kycRequest('POST', `/kyc/${created.id}/review`, 'operator', { status: 'approved' }),
    );
    expect(res.status).toBe(200);
    const { data } = await readKyc(res);
    expect(data.status).toBe('approved');
    expect(data.reviewedBy).toBeTruthy();
    expect(data.reviewedAt).toBeTruthy();

    const audit = kyc.auditLog();
    expect(audit).toHaveLength(1);
    expect(audit[0]?.action).toBe('kyc.review');
    expect(audit[0]?.entityId).toBe(created.id);
  });

  it('rejects a submission with notes and writes an audit log entry', async () => {
    const created = (
      await readKyc(await app.handle(kycRequest('POST', '/kyc', 'investor', {})))
    ).data;

    const res = await app.handle(
      kycRequest('POST', `/kyc/${created.id}/review`, 'operator', {
        status: 'rejected',
        notes: 'Document expired',
      }),
    );
    expect(res.status).toBe(200);
    const { data } = await readKyc(res);
    expect(data.status).toBe('rejected');
    expect(data.notes).toBe('Document expired');
    expect(kyc.auditLog()).toHaveLength(1);
  });

  it('enforces access control', async () => {
    const created = (
      await readKyc(await app.handle(kycRequest('POST', '/kyc', 'investor', {})))
    ).data;

    const list = await app.handle(kycRequest('GET', '/kyc?status=pending', 'investor'));
    expect(list.status).toBe(403);

    const review = await app.handle(
      kycRequest('POST', `/kyc/${created.id}/review`, 'investor', { status: 'approved' }),
    );
    expect(review.status).toBe(403);

    const submit = await app.handle(kycRequest('POST', '/kyc', 'operator', {}));
    expect(submit.status).toBe(403);
  });

  it('returns 404 when reviewing an unknown submission', async () => {
    const res = await app.handle(
      kycRequest('POST', `/kyc/${crypto.randomUUID()}/review`, 'operator', {
        status: 'approved',
      }),
    );
    expect(res.status).toBe(404);
    expect((await readKyc(res)).error.code).toBe('KYC_NOT_FOUND');
  });
});
