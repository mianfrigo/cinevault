import { GENERIC_MESSAGE, RATE_LIMIT_MESSAGE } from '@shared/utils/failure-message';

export const LAST_ADMIN_MESSAGE =
  'There must always be one administrator. Make someone else an admin first.';
export const SELF_ACTION_MESSAGE = 'You cannot do that to your own account.';

/** Plain words for what the API refused with; never the server's own text. */
export function adminFailure(code: string): string {
  if (code === 'LAST_ADMIN') return LAST_ADMIN_MESSAGE;
  if (code === 'SELF_ACTION') return SELF_ACTION_MESSAGE;
  return code === 'RATE_LIMITED' ? RATE_LIMIT_MESSAGE : GENERIC_MESSAGE;
}
