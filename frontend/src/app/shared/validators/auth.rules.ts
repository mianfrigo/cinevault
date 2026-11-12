import {
  email,
  maxLength,
  minLength,
  required,
  schema,
  validate,
  type SchemaPath,
} from '@angular/forms/signals';

// Limits from docs/backend-schema.md section 4. Passwords are never trimmed.
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

export const emailRules = schema<string>((p) => {
  required(p, { message: 'Enter your email address.' });
  email(p, { message: 'Enter a valid email address.' });
  maxLength(p, 254, { message: 'Use 254 characters or fewer.' });
});

export const nameRules = schema<string>((p) => {
  validate(p, ({ value }) =>
    value().trim() ? undefined : { kind: 'required', message: 'Enter your name.' },
  );
  maxLength(p, 80, { message: 'Use 80 characters or fewer.' });
});

export const newPasswordRules = schema<string>((p) => {
  required(p, { message: 'Enter a password.' });
  minLength(p, PASSWORD_MIN, { message: `Use at least ${PASSWORD_MIN} characters.` });
  maxLength(p, PASSWORD_MAX, { message: `Use ${PASSWORD_MAX} characters or fewer.` });
});

/** Cross-field rule: the confirmation must equal the password field it is checked against. */
export function confirmMatches(confirm: SchemaPath<string>, password: SchemaPath<string>): void {
  validate(confirm, ({ value, valueOf }) =>
    value() === valueOf(password)
      ? undefined
      : { kind: 'mismatch', message: 'Passwords do not match.' },
  );
}
