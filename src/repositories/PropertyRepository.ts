import { count, desc, eq } from 'drizzle-orm';
import {
  computeSharePriceUsdCents,
  type CreatePropertyInput,
  type Paginated,
  type PaginationInput,
  type Property,
  type UpdatePropertyInput,
} from '../shared';
import type { Database } from '../db';
import { properties, type PropertyRow } from '../db/schema';

export interface PropertyRepository {
  list(page: PaginationInput): Promise<Paginated<Property>>;
  get(id: string): Promise<Property | null>;
  create(input: CreatePropertyInput): Promise<Property>;
  update(id: string, input: UpdatePropertyInput): Promise<Property | null>;
}

function toProperty(row: PropertyRow): Property {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function withSharePrice<T extends Partial<CreatePropertyInput>>(
  input: T,
  current?: Pick<Property, 'valuationUsdCents' | 'totalShares'>,
) {
  const valuation = input.valuationUsdCents ?? current?.valuationUsdCents;
  const shares = input.totalShares ?? current?.totalShares;
  if (valuation === undefined || shares === undefined) return input;
  return { ...input, sharePriceUsdCents: computeSharePriceUsdCents(valuation, shares) };
}

export class DrizzlePropertyRepository implements PropertyRepository {
  constructor(private readonly db: Database) {}

  async list({ page, pageSize }: PaginationInput): Promise<Paginated<Property>> {
    const [rows, totals] = await Promise.all([
      this.db
        .select()
        .from(properties)
        .orderBy(desc(properties.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      this.db.select({ total: count() }).from(properties),
    ]);
    return { items: rows.map(toProperty), page, pageSize, total: totals[0]?.total ?? 0 };
  }

  async get(id: string): Promise<Property | null> {
    const [row] = await this.db.select().from(properties).where(eq(properties.id, id));
    return row ? toProperty(row) : null;
  }

  async create(input: CreatePropertyInput): Promise<Property> {
    const values = withSharePrice(input) as typeof properties.$inferInsert;
    const [row] = await this.db.insert(properties).values(values).returning();
    return toProperty(row!);
  }

  async update(id: string, input: UpdatePropertyInput): Promise<Property | null> {
    const current = await this.get(id);
    if (!current) return null;
    const [row] = await this.db
      .update(properties)
      .set({ ...withSharePrice(input, current), updatedAt: new Date() })
      .where(eq(properties.id, id))
      .returning();
    return row ? toProperty(row) : null;
  }
}

/** Used in tests and when DATABASE_URL is unset during local UI work. */
export class InMemoryPropertyRepository implements PropertyRepository {
  private readonly items = new Map<string, Property>();

  async list({ page, pageSize }: PaginationInput): Promise<Paginated<Property>> {
    const all = [...this.items.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const start = (page - 1) * pageSize;
    return { items: all.slice(start, start + pageSize), page, pageSize, total: all.length };
  }

  async get(id: string): Promise<Property | null> {
    return this.items.get(id) ?? null;
  }

  async create(input: CreatePropertyInput): Promise<Property> {
    const now = new Date().toISOString();
    const property: Property = {
      ...input,
      id: crypto.randomUUID(),
      status: 'draft',
      sharePriceUsdCents: computeSharePriceUsdCents(input.valuationUsdCents, input.totalShares),
      tokenContractId: null,
      createdAt: now,
      updatedAt: now,
    };
    this.items.set(property.id, property);
    return property;
  }

  async update(id: string, input: UpdatePropertyInput): Promise<Property | null> {
    const current = this.items.get(id);
    if (!current) return null;
    const next: Property = {
      ...current,
      ...withSharePrice(input, current),
      location: input.location ?? current.location,
      updatedAt: new Date().toISOString(),
    };
    this.items.set(id, next);
    return next;
  }
}
