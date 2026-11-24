/**
 * The reader's limits, so a runaway or hostile reply can't freeze the window.
 * A reply over a limit gives `too-large` or `too-deep` instead of a tree.
 */

/** The most characters a reply may hold. */
export const OPENUI_MAX_CHARS = 32_000;

/**
 * How deep lists, objects and calls may nest, counting through references.
 * `Stack([Card([...])])` is four levels, so this allows about 16 nested components.
 */
export const OPENUI_MAX_NESTING = 32;

/** The most values one reply may draw. A statement used twice counts twice. */
export const OPENUI_MAX_NODES = 5_000;

/** The most items one list may hold: table rows, cells, a component's children. */
export const OPENUI_MAX_ROWS = 500;

/** The most columns a table may have. The component list sets it as the list's `maxItems`. */
export const OPENUI_MAX_COLUMNS = 20;

/** The most fields a form may have. The component list sets it as the list's `maxItems`. */
export const OPENUI_MAX_FIELDS = 30;

/** Thrown inside the reader when a limit is passed; the reader turns it into a result. */
export class OpenUiLimitError extends Error {
  readonly limit: "too-large" | "too-deep";

  constructor(limit: "too-large" | "too-deep") {
    super(limit);
    this.limit = limit;
  }
}
