/** Emails are stored lowercase and trimmed, so the plain unique index is enough. */
export const normalizeEmail = (e: string): string => e.trim().toLowerCase();
