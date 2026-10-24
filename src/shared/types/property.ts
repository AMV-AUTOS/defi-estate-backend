export const PROPERTY_STATUSES = ['draft', 'pending_review', 'tokenized', 'archived'] as const;
export type PropertyStatus = (typeof PROPERTY_STATUSES)[number];

export const PROPERTY_TYPES = ['residential', 'commercial', 'mixed_use', 'land'] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export interface Property {
  id: string;
  name: string;
  description: string;
  type: PropertyType;
  status: PropertyStatus;
  location: {
    address: string;
    city: string;
    country: string;
  };
  /** Appraised value in USD cents. */
  valuationUsdCents: number;
  /** Total number of shares the property is split into. */
  totalShares: number;
  /** Price of a single share in USD cents. */
  sharePriceUsdCents: number;
  /** Expected annual rental yield in basis points (650 = 6.50%). */
  expectedYieldBps: number;
  /** Soroban contract ID of the property share token, once deployed. */
  tokenContractId: string | null;
  imageUrl: string | null;
  createdAt: string;
  updatedAt: string;
}
