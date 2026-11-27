import type { ToolScriptData } from "@halonicjs/ports";

const placeholder = /\{input\.([A-Za-z0-9]+)(\[\])?\}/g;

/**
 * Every target a template allows for these inputs: `{input.name}` becomes
 * the input's value, and `{input.name[]}` each item of a list input, so
 * `{input.repos[]}` with `repos: ["a", "b"]` allows `a` and `b`. A
 * placeholder whose input is missing, or of the wrong kind, allows nothing.
 */
export function expandTemplate(template: string, input: ToolScriptData): string[] {
  let targets = [""];
  let rest = 0;
  for (const match of template.matchAll(placeholder)) {
    const values = placeholderValues(input, match[1] ?? "", match[2] !== undefined);
    const text = template.slice(rest, match.index);
    targets = targets.flatMap((start) => values.map((value) => `${start}${text}${value}`));
    rest = match.index + match[0].length;
  }
  const tail = template.slice(rest);
  return targets.map((start) => `${start}${tail}`);
}

function placeholderValues(input: ToolScriptData, name: string, list: boolean): string[] {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return [];
  const value = (input as Readonly<Record<string, ToolScriptData>>)[name];
  if (list) return Array.isArray(value) ? value.flatMap(scalarText) : [];
  return scalarText(value);
}

function scalarText(value: ToolScriptData | undefined): string[] {
  if (typeof value === "string") return [value];
  if (typeof value === "number" || typeof value === "boolean") return [String(value)];
  return [];
}

/**
 * Whether a write's frozen arguments stay inside its declared targets
 * (S14): every field the capability's `touches` entry names must be in the
 * arguments, as a string or number one of its templates allows. `targets`
 * is `undefined` when the header declares no entry for the capability,
 * which allows nothing.
 */
export function withinTouches(
  args: ToolScriptData,
  targets: Readonly<Record<string, string>> | undefined,
  input: ToolScriptData,
): boolean {
  if (targets === undefined) return false;
  if (typeof args !== "object" || args === null || Array.isArray(args)) return false;
  const fields = args as Readonly<Record<string, ToolScriptData>>;
  return Object.entries(targets).every(([field, template]) => {
    const actual = scalarText(fields[field]);
    return actual.length === 1 && expandTemplate(template, input).includes(actual[0] ?? "");
  });
}
