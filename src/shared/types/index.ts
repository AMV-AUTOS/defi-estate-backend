export * from './api';
export * from './property';

export type KycStatus = 'pending' | 'approved' | 'rejected';

export interface KycSubmission {
  id: string;
  userId: string;
  status: KycStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KycReviewInput {
  decision: KycStatus;
  notes?: string;
}

export interface KycListQuery {
  status?: KycStatus;
}