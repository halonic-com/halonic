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

/** How {@link uniqueName} makes a name. */
export interface UniqueNameOptions {
  /**
   * Numbers every name, from `base-1`, so the bare `base` is never used.
   * For names that only tell things of one kind apart, like a new step `step-1`.
   */
  readonly numbered?: boolean;
}

/**
 * Returns `base` when no existing name uses it, otherwise the first free
 * `base-2`, `base-3` and so on. With `numbered`, returns the first free
 * `base-1`, `base-2` and so on.
 *
 * @param base - the name to start from, usually a slug
 * @param taken - the names already in use
 * @param options - whether every name gets a number
 * @returns a name that isn't in `taken`
 *
 * @example
 * uniqueName("report", ["report", "report-2"]); // "report-3"
 * uniqueName("step", [], { numbered: true }); // "step-1"
 */
export function uniqueName(
  base: string,
  taken: Iterable<string>,
  options: UniqueNameOptions = {},
): string {
  const used = new Set(taken);
  if (!options.numbered && !used.has(base)) {
    return base;
  }
  let suffix = options.numbered ? 1 : 2;
  while (used.has(`${base}-${suffix}`)) {
    suffix++;
  }
  return `${base}-${suffix}`;
}
