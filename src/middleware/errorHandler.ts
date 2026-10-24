import { Elysia } from 'elysia';
import { ZodError } from 'zod';
import type { ApiError } from '../shared';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const errorHandler = new Elysia({ name: 'error-handler' }).onError(
  { as: 'global' },
  ({ error, code, set }): ApiError => {
    if (error instanceof HttpError) {
      set.status = error.status;
      return { success: false, error: { code: error.code, message: error.message } };
    }
    if (error instanceof ZodError) {
      set.status = 400;
      return {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: error.issues },
      };
    }
    if (code === 'NOT_FOUND') {
      set.status = 404;
      return { success: false, error: { code: 'NOT_FOUND', message: 'Route not found' } };
    }
    console.error(error);
    set.status = 500;
    return { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } };
  },
);
