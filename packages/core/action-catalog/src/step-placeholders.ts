import type { Step } from "@halonicjs/action-steppers";

// Shared by definitions that reuse another definition's reviewed steps. It
// sits next to the service folders, not in one, because every file in a
// service folder is a definition.

const placeholder = /\{([A-Za-z][A-Za-z0-9_]*)\}/g;

function renamedIn(value: unknown, names: Readonly<Record<string, string>>): unknown {
  if (typeof value === "string") {
    return value.replace(placeholder, (whole, name: string) =>
      Object.hasOwn(names, name) ? `{${names[name]}}` : whole,
    );
  }
  if (Array.isArray(value)) return value.map((item) => renamedIn(item, names));
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value).map(([key, item]) => [key, renamedIn(item, names)]);
    return Object.fromEntries(entries);
  }
  return value;
}

/**
 * A reviewed step with its `{name}` placeholders renamed, all at once, in
 * every text it holds: its address or path, instructions, manual form and
 * target. A definition that reuses another's step needs it when its own
 * parameters are named differently, such as `github.create-repository`, whose
 * repository is `name` (GitHub's body field) where the reused steps say
 * `repo`. Field names, such as a check's `keep`, have no braces and stay.
 *
 * @example
 * withPlaceholders(secretSavedCheck, { repo: "name", name: "secret" }).path;
 * // => "/repos/{owner}/{name}/actions/secrets/{secret}"
 */
export function withPlaceholders<S extends Step>(
  step: S,
  names: Readonly<Record<string, string>>,
): S {
  return renamedIn(step, names) as S;
}
