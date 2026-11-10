export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Mail is sent fire-and-forget, so poll until `count` messages arrived. */
export async function waitForMail(
  rec: { sent: unknown[] },
  count: number,
  timeoutMs = 3000,
) {
  const end = Date.now() + timeoutMs;
  while (rec.sent.length < count && Date.now() < end) await sleep(10);
  expect(rec.sent.length).toBeGreaterThanOrEqual(count);
}

/** Asserts that no further mail arrives after a short settle wait. */
export async function expectNoMoreMail(
  rec: { sent: unknown[] },
  count: number,
) {
  await sleep(300);
  expect(rec.sent).toHaveLength(count);
}
