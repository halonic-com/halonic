import { Fragment, type ReactNode } from "react";

const placeholder = /\{(\w+)\}/;

/**
 * The words of `key` in `table` with each `{name}` replaced by its value, which may be text or an
 * element (a site name keeps its bold domain inside a sentence).
 *
 * @throws Error when the words name a value that isn't given, so a missing value never shows as
 *   `{agent}`
 */
export function fillWords<Table extends Readonly<Record<string, string>>>(
  table: Table,
  key: keyof Table & string,
  values: Readonly<Record<string, ReactNode>> = {},
): ReactNode[] {
  // split() with a capture group gives text, name, text, name, …: the odd parts are names.
  return (table[key] as string).split(placeholder).map((part, index) => {
    if (index % 2 === 0) return part;
    if (!(part in values)) throw new Error(`${key}: no value for {${part}}`);
    const value = values[part];
    if (typeof value === "string" || typeof value === "number") return String(value);
    // By place, not by name: a sentence may use one name twice.
    return <Fragment key={index}>{value}</Fragment>;
  });
}
