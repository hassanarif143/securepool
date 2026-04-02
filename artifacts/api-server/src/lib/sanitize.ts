export function sanitizeText(input: unknown, max = 500): string {
  const raw = String(input ?? "");
  const noTags = raw.replace(/<[^>]*>?/gm, "");
  return noTags.replace(/\s+/g, " ").trim().slice(0, max);
}

