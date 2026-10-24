import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { InMemoryPropertyRepository } from '../../src/repositories/InMemoryPropertyRepository';
import { DrizzlePropertyRepository } from '../../src/repositories/DrizzlePropertyRepository';
import type { PropertyRepository } from '../../src/repositories/PropertyRepository';
import type { NewProperty } from '../../src/db/schema';

const hasDatabase = Boolean(process.env.DATABASE_URL);

function makeProperty(overrides: Partial<NewProperty> = {}): NewProperty {
  return {
    name: 'Sunset Apartments',
    address: '123 Main St',
    city: 'Springfield',
    ...overrides,
  } as NewProperty;
}

function runRepositoryCases(
  label: string,
  getRepository: () => Promise<PropertyRepository> | PropertyRepository,
) {
  describe(label, () => {
    let repository: PropertyRepository;

    beforeAll(async () => {
      repository = await getRepository();
    });

    it('creates a property and returns it with an id', async () => {
      const created = await repository.create(makeProperty());

      expect(created).toBeDefined();
      expect(created.id).toBeDefined();
      expect(created.name).toBe('Sunset Apartments');
      expect(created.address).toBe('123 Main St');
      expect(created.city).toBe('Springfield');
    });

    it('finds a property by id', async () => {
      const created = await repository.create(makeProperty({ name: 'Find Me' }));

      const found = await repository.findById(created.id);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.name).toBe('Find Me');
    });

    it('returns null when a property does not exist', async () => {
      const found = await repository.findById('00000000-0000-0000-0000-000000000000');

      expect(found).toBeNull();
    });

    it('lists all properties', async () => {
      const before = await repository.findAll();

      await repository.create(makeProperty({ name: 'Listed One' }));
      await repository.create(makeProperty({ name: 'Listed Two' }));

      const after = await repository.findAll();

      expect(after.length).toBe(before.length + 2);
      const names = after.map((property) => property.name);
      expect(names).toContain('Listed One');
      expect(names).toContain('Listed Two');
    });

    it('updates an existing property', async () => {
      const created = await repository.create(makeProperty({ name: 'Old Name' }));

      const updated = await repository.update(created.id, { name: 'New Name' });

      expect(updated).not.toBeNull();
      expect(updated?.id).toBe(created.id);
      expect(updated?.name).toBe('New Name');

      const found = await repository.findById(created.id);
      expect(found?.name).toBe('New Name');
    });

    it('returns null when updating a non-existent property', async () => {
      const updated = await repository.update('00000000-0000-0000-0000-000000000000', {
        name: 'Ghost',
      });

      expect(updated).toBeNull();
    });

    it('deletes an existing property', async () => {
      const created = await repository.create(makeProperty({ name: 'Delete Me' }));

      const deleted = await repository.delete(created.id);

      expect(deleted).toBe(true);

      const found = await repository.findById(created.id);
      expect(found).toBeNull();
    });

    it('returns false when deleting a non-existent property', async () => {
      const deleted = await repository.delete('00000000-0000-0000-0000-000000000000');

      expect(deleted).toBe(false);
    });
  });
}

runRepositoryCases('InMemoryPropertyRepository', () => new InMemoryPropertyRepository());

describe.skipIf(!hasDatabase)('DrizzlePropertyRepository (Postgres)', () => {
  let repository: DrizzlePropertyRepository;
  let close: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    const { createDatabase } = await import('../../src/db/client');
    const { db, pool } = createDatabase(process.env.DATABASE_URL as string);
    repository = new DrizzlePropertyRepository(db);
    close = async () => {
      await pool.end();
    };
  });

  afterAll(async () => {
    if (close) {
      await close();
    }
  });

  runRepositoryCases('DrizzlePropertyRepository', () => repository);
});
</｜｜DSML｜｜ parameter>