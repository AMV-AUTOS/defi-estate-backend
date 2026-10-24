import { describe, expect, it } from 'bun:test';
import {
  computeSharePriceUsdCents,
  createPropertySchema,
  getContractId,
  getNetworkConfig,
} from '../src/shared';

const valid = {
  name: 'Lekki Garden Apartments',
  type: 'residential',
  location: { address: '12 Admiralty Way', city: 'Lagos', country: 'NG' },
  valuationUsdCents: 50_000_000,
  totalShares: 10_000,
  expectedYieldBps: 750,
};

describe('createPropertySchema', () => {
  it('accepts a valid property and applies defaults', () => {
    const parsed = createPropertySchema.parse(valid);
    expect(parsed.description).toBe('');
    expect(parsed.imageUrl).toBeNull();
  });

  it('rejects a yield above 100%', () => {
    expect(createPropertySchema.safeParse({ ...valid, expectedYieldBps: 10_001 }).success).toBe(
      false,
    );
  });

  it('rejects a non ISO country code', () => {
    const bad = { ...valid, location: { ...valid.location, country: 'Nigeria' } };
    expect(createPropertySchema.safeParse(bad).success).toBe(false);
  });
});

describe('computeSharePriceUsdCents', () => {
  it('rounds down', () => {
    expect(computeSharePriceUsdCents(1000, 3)).toBe(333);
  });

  it('rejects zero shares', () => {
    expect(() => computeSharePriceUsdCents(1000, 0)).toThrow();
  });
});

describe('contract registry', () => {
  it('exposes network config', () => {
    expect(getNetworkConfig('testnet').networkPassphrase).toContain('Test SDF');
  });

  it('throws for an undeployed contract', () => {
    expect(() => getContractId('testnet', 'propertyToken')).toThrow(/no deployment/);
  });
});
