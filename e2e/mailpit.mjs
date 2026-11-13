// Reads the mail this run sent from Mailpit's HTTP API. Only messages addressed to the given fake
// recipient are read or deleted: the mailbox is shared with the dev stack and belongs to the owner.
const BASE = process.env.MAILPIT_URL ?? 'http://localhost:8025';

/** The first http(s) link whose path ends in `/verify-email` (token in the query), or null. */
export function extractVerifyLink(text) {
  const m = /https?:\/\/[^\s"'<>]+\/verify-email\?token=[A-Za-z0-9_\-.~%]+/.exec(text ?? '');
  return m ? m[0] : null;
}

async function json(path, init) {
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok)
    throw new Error(`Mailpit ${init?.method ?? 'GET'} ${path.split('?')[0]} -> ${res.status}`);
  return init?.method === 'DELETE' ? null : res.json(); // DELETE answers a plain 'ok'
}

/** Messages to this exact address (search `to:` is a substring match, so the result is filtered again). */
export async function messagesTo(address) {
  const { messages } = await json(`/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`);
  return messages.filter((m) =>
    m.To.some((t) => t.Address.toLowerCase() === address.toLowerCase()),
  );
}

/** Polls until a message to `address` carries a verification link; no fixed sleep beyond the poll step. */
export async function waitForVerifyLink(address, { timeoutMs = 15_000, stepMs = 200 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    for (const m of await messagesTo(address)) {
      const full = await json(`/api/v1/message/${m.ID}`);
      const link = extractVerifyLink(full.Text) ?? extractVerifyLink(full.HTML);
      if (link) return link;
    }
    if (Date.now() > deadline)
      throw new Error(`No verification mail for ${address} within ${timeoutMs} ms`);
    await new Promise((r) => setTimeout(r, stepMs));
  }
}

/** Deletes the messages sent to this address (by id) and returns how many. */
export async function deleteMessagesTo(address) {
  const ids = (await messagesTo(address)).map((m) => m.ID);
  if (ids.length) {
    await json('/api/v1/messages', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ IDs: ids }),
    });
  }
  return ids.length;
}
