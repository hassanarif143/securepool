/** "Ahmed Raza" → "Ahmed R." for public activity feeds */
export function privacyDisplayName(fullName: string): string {
  const t = fullName.trim().replace(/\s+/g, " ");
  if (!t) return "Member";
  const parts = t.split(" ");
  if (parts.length === 1) return parts[0]!.slice(0, 12);
  const first = parts[0]!;
  const last = parts[parts.length - 1]!;
  const initial = last.charAt(0).toUpperCase();
  return `${first} ${initial}.`;
}
