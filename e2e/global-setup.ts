import { startStack } from './stack.mjs';

export default async function globalSetup() {
  const stack = await startStack();
  // Inherited by the worker processes.
  process.env.E2E_ADMIN_EMAIL = stack.adminEmail;
  process.env.E2E_ADMIN_PASSWORD = stack.adminPassword;
  return () => stack.stop();
}
