/** At most `max` UTF-16 units of `text`, cut between code points so no surrogate pair is split. */
export function cutUnits(text: string, max: number): string {
  let out = '';
  for (const ch of text) {
    if (out.length + ch.length > max) break;
    out += ch;
  }
  return out;
}
