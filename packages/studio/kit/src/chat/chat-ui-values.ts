import type { OpenUiComponent, OpenUiValue } from "@halonicjs/openui-lang";

/** A prop's value: the reader leaves out an empty prop, so it may be missing. */
export function prop(part: OpenUiComponent, name: string): OpenUiValue | undefined {
  return part.props[name];
}

/** A plain value as words; the reader keeps only text, numbers and true or false here. */
export function text(value: OpenUiValue | undefined): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return typeof value === "object" ? "" : String(value);
}

/** A list prop, empty when the reply leaves it out. */
export function list<Item extends OpenUiValue>(value: OpenUiValue | undefined): readonly Item[] {
  return (value ?? []) as readonly Item[];
}
