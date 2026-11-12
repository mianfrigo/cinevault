/** "Keanu Reeves" -> "KR", "Cher" -> "C"; the fallback for a name without letters. */
export function initials(name: string, fallback = ''): string {
  const words = name.split(/\s+/).filter(Boolean);
  const letters = [words[0], words.length > 1 ? words[words.length - 1] : ''];
  const text = letters
    .map((w) => w?.[0] ?? '')
    .join('')
    .toUpperCase();
  return text || fallback;
}
