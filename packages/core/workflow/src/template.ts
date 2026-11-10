/**
 * Reads a dotted path, such as `"context.user.name"`, from a scope. Each part
 * is a property name; on an array it can be an index (`"tags.0"`).
 *
 * The result is `undefined` as soon as a part is missing, or when the value
 * before it is not an object (a string, a number, `null` or `undefined`).
 *
 * Only own properties count. Inherited names such as `constructor`,
 * `__proto__` or `toString` would otherwise give a function or a prototype,
 * which a template then writes as `undefined` or `{}`.
 *
 * @example
 * getPath({ context: { user: { name: "Ada" } } }, "context.user.name"); // "Ada"
 * getPath({ tags: ["urgent"] }, "tags.0"); // "urgent"
 * getPath({ context: {} }, "context.user.name"); // undefined
 * getPath({}, "constructor"); // undefined
 */
export function getPath(scope: unknown, path: string): unknown {
  let current: unknown = scope;
  for (const part of path.split(".")) {
    if (current === null || typeof current !== "object") {
      return undefined;
    }
    if (!Object.hasOwn(current, part)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/** A text that is one placeholder and nothing else, such as `"{{ input.n }}"`. */
const WHOLE_PLACEHOLDER = /^\{\{\s*([\w.-]+)\s*\}\}$/;

/** Every placeholder inside a text. */
const ANY_PLACEHOLDER = /\{\{\s*([\w.-]+)\s*\}\}/g;

/**
 * Renders the `{{path}}` placeholders in a value against a scope.
 *
 * - A string that is exactly one placeholder gives the raw value at that
 *   path, so numbers, lists and objects keep their type.
 * - In any other string, each placeholder is replaced by its value as text:
 *   `undefined` and `null` become `""`, strings stay as they are and anything
 *   else is written as JSON.
 * - A value that is not a string is returned unchanged.
 *
 * @example
 * const scope = { input: { n: 3, name: "Ada" } };
 * render("{{input.n}}", scope); // 3
 * render("Hi {{input.name}}, {{input.n}}!", scope); // "Hi Ada, 3!"
 * render(42, scope); // 42
 */
export function render(value: unknown, scope: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  const wholePath = WHOLE_PLACEHOLDER.exec(value)?.[1];
  if (wholePath) {
    return getPath(scope, wholePath);
  }
  return value.replace(ANY_PLACEHOLDER, (_placeholder, path: string) =>
    valueAsText(getPath(scope, path)),
  );
}

/**
 * Renders a text like {@link render}, and always gives text: a whole
 * placeholder's value is turned into text the same way as a placeholder
 * inside a text.
 *
 * @example
 * renderText("{{input.n}}", { input: { n: 3 } }); // "3"
 * renderText("{{input.missing}}", { input: {} }); // ""
 */
export function renderText(value: string, scope: unknown): string {
  return valueAsText(render(value, scope));
}

/** A rendered value as text: nothing for `undefined` and `null`, JSON for anything but a string. */
function valueAsText(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}

/** What a person reads about a step: its first line, and the lines after it. */
export interface RenderedDescription {
  /** The first line, filled in and on one line. Empty when the description has none. */
  readonly title: string;
  /** Lines 2 onward, filled in. Empty when there are none. */
  readonly body: string;
}

/**
 * Fills in a step's description against a scope, once, for every place that
 * shows it (the waiting line, the Inbox row and card). The first line is the
 * title and the rest is the body; the description is split before it is
 * filled in, so a value with line breaks in the first line can't move text
 * between them. Line breaks in the title become one space.
 *
 * A placeholder that resolves to nothing gives empty text, so it never shows
 * as `{{…}}`. The filled-in values are not escaped here: whoever shows them
 * shows them as plain text.
 *
 * @example
 * renderDescription("Approve this reply?\n{{context.reply}}", { context: { reply: "Hi" } });
 * // { title: "Approve this reply?", body: "Hi" }
 * renderDescription("Check {{context.order}}", { context: {} });
 * // { title: "Check", body: "" }
 */
export function renderDescription(description: string, scope: unknown): RenderedDescription {
  const lineBreak = description.indexOf("\n");
  const firstLine = lineBreak === -1 ? description : description.slice(0, lineBreak);
  const rest = lineBreak === -1 ? "" : description.slice(lineBreak + 1);
  return {
    title: renderText(firstLine, scope).replace(/\s+/g, " ").trim(),
    body: rest === "" ? "" : trimBlankLines(renderText(rest, scope)),
  };
}

/** A text without the blank lines at its start and end; blank lines inside stay. */
function trimBlankLines(text: string): string {
  return text.replace(/^(?:[ \t]*\r?\n)+/, "").trimEnd();
}
