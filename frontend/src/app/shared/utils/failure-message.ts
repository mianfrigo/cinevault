import { ApiError } from '@core/models';

export const RATE_LIMIT_MESSAGE = 'Too many attempts. Try again in a minute.';
export const GENERIC_MESSAGE = 'Something went wrong. Please try again.';

/** Neutral, retryable copy for a failed request: never the raw server text. */
export const failureMessage = (error: ApiError): string =>
  error.statusCode === 429 || error.code === 'RATE_LIMITED' ? RATE_LIMIT_MESSAGE : GENERIC_MESSAGE;
