/** "Alex Mercer" -> "Alex M.", "Cher" -> "Cher": the name as the nav shows it beside the avatar. */
export function shortName(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length < 2) return words[0] ?? '';
  return `${words[0]} ${words[words.length - 1][0].toUpperCase()}.`;
}
