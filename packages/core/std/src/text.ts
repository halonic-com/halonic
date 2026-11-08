/** What `slugify` returns when nothing usable is left of the name. */
const fallbackSlug = "item";

/**
 * Turns a display name into a file-safe id: lowercase ASCII letters and digits
 * joined by single hyphens. Spaces and underscores both become hyphens
 * ("snake_case" becomes "snake-case"), and accents are dropped ("Café" becomes
 * "cafe"), as in the old Studio. Hyphens at either end are dropped, so the id
 * can't be read as a command-line flag ("_a_" becomes "a"). A name with nothing
 * usable left ("___", "!!! - !!!") becomes "item".
 *
 * @param name - the name a person typed
 * @returns the id
 *
 * @example
 * slugify("Weekly Report"); // "weekly-report"
 * slugify("Café crème!"); // "cafe-creme"
 */
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    // Splits "é" into "e" and a combining accent, which the next step removes.
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (slug === "") {
    return fallbackSlug;
  }
  return slug;
}

/**
 * Returns `base` when no existing name uses it, otherwise the first free
 * `base-2`, `base-3` and so on.
 *
 * @param base - the name to start from, usually a slug
 * @param taken - the names already in use
 * @returns a name that isn't in `taken`
 *
 * @example
 * uniqueName("report", ["report", "report-2"]); // "report-3"
 */
export function uniqueName(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(base)) {
    return base;
  }
  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) {
    suffix++;
  }
  return `${base}-${suffix}`;
}
