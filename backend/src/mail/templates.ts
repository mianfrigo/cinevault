export interface Mail {
  subject: string;
  text: string;
  html: string;
}

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const greeting = (name: string) => (name.trim() ? `Hi ${name.trim()},` : 'Hi,');

/** `paragraphs` are plain strings; `link` (optional) is rendered as its own line/anchor. */
function build(
  subject: string,
  name: string,
  paragraphs: string[],
  link?: string,
): Mail {
  const textParts = [greeting(name), ...paragraphs];
  const htmlParts = [greeting(name), ...paragraphs].map(
    (p) => `<p>${escapeHtml(p)}</p>`,
  );
  if (link) {
    textParts.splice(2, 0, link);
    const href = escapeHtml(link);
    htmlParts.splice(2, 0, `<p><a href="${href}">${href}</a></p>`);
  }
  return {
    subject,
    text: textParts.join('\n\n'),
    html: htmlParts.join('\n'),
  };
}

const tokenLink = (origin: string, path: string, token: string) =>
  `${origin}${path}?token=${encodeURIComponent(token)}`;

export const verifyEmail = (origin: string, name: string, token: string) =>
  build(
    'Verify your Cinevault email',
    name,
    [
      'Welcome to Cinevault. Confirm your email address to activate your account:',
      'This link expires in 24 hours. If you did not create an account, you can ignore this email.',
    ],
    tokenLink(origin, '/verify-email', token),
  );

export const resetPassword = (origin: string, name: string, token: string) =>
  build(
    'Reset your Cinevault password',
    name,
    [
      'We received a request to reset your Cinevault password. Choose a new one here:',
      'This link expires in 1 hour. If you did not request this, you can ignore this email.',
    ],
    tokenLink(origin, '/reset-password', token),
  );

export const changeEmail = (origin: string, name: string, token: string) =>
  build(
    'Confirm your new Cinevault email',
    name,
    [
      'Confirm this address to make it the email of your Cinevault account:',
      'This link expires in 24 hours. If you did not request this change, you can ignore this email.',
    ],
    tokenLink(origin, '/verify-email', token),
  );

export const alreadyRegistered = (origin: string, name: string) =>
  build('You already have a Cinevault account', name, [
    `Someone tried to sign up to Cinevault with this email address, but an account already exists. You can log in at ${origin}/login.`,
    `If you forgot your password, reset it at ${origin}/forgot-password. If this was not you, you can ignore this email.`,
  ]);
