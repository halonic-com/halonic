// What a changed text of a listed tool is called, in plain words. Studio and
// `halonic tools review` both label a change from its path with this, so the
// two can't word it differently (HAL-2842).

/** What a change is about, as the person reads it. */
export type ListedToolChangeLabel =
  | { readonly kind: "name" }
  | { readonly kind: "description" }
  | { readonly kind: "required" }
  /** One field of one argument: `id` and `description`. */
  | { readonly kind: "argument"; readonly argument: string; readonly field: string }
  /** Any other text, by its path under `parameters`. */
  | { readonly kind: "other"; readonly path: string };

/** A path token with its JSON-pointer escapes (`~1` for `/`, `~0` for `~`) undone. */
function pointerText(token: string): string {
  return token.replaceAll("~1", "/").replaceAll("~0", "~");
}

/**
 * Reads a change's path as a label. The texts are not escaped here: whoever shows them does.
 *
 * @example
 * listedToolChangeLabel("parameters/properties/id/description");
 * // { kind: "argument", argument: "id", field: "description" }
 * listedToolChangeLabel("parameters/required"); // { kind: "required" }
 */
export function listedToolChangeLabel(path: string): ListedToolChangeLabel {
  if (path === "name") return { kind: "name" };
  if (path === "description") return { kind: "description" };
  if (path === "parameters/required") return { kind: "required" };
  const argument = /^parameters\/properties\/([^/]+)\/([^/]+)$/u.exec(path);
  if (argument !== null) {
    const [, id = "", field = ""] = argument;
    return { kind: "argument", argument: pointerText(id), field: pointerText(field) };
  }
  return { kind: "other", path: pointerText(path.replace(/^parameters\//u, "")) };
}
