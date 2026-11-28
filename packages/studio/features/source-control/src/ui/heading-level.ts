/**
 * The level of a heading inside What changed: 2 under a page's `h1`, and one lower for each heading
 * above it, a file's path or the content pane's `h2` (a11y C3: no level is skipped).
 */
export type ChangeHeadingLevel = 2 | 3 | 4;

/** The element for a heading of `level`: "h3" for 3. */
export function headingTag(level: ChangeHeadingLevel): "h2" | "h3" | "h4" {
  return `h${level}` as const;
}

/** The level one below `level`: a file's groups under its path. */
export function levelBelow(level: 2 | 3): 3 | 4 {
  return level === 2 ? 3 : 4;
}
