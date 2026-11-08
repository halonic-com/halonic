/**
 * Reads a dotted path, such as `"context.user.name"`, from a scope. Each part
 * is a property name; on an array it can be an index (`"tags.0"`).
 *
 * The result is `undefined` as soon as a part is missing, or when the value
 * before it is not an object (a string, a number, `null` or `undefined`).
 *
 * @example
 * getPath({ context: { user: { name: "Ada" } } }, "context.user.name"); // "Ada"
 * getPath({ tags: ["urgent"] }, "tags.0"); // "urgent"
 * getPath({ context: {} }, "context.user.name"); // undefined
 */
export function getPath(scope: unknown, path: string): unknown {
  let current: unknown = scope;
  for (const part of path.split(".")) {
    if (current === null || typeof current !== "object") {
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
