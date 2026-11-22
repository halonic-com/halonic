// What changed in a Changed program's row of the trust check: old → new on each value that
// changed, and a mark on each that wasn't there (mockup-trust section 2, C706 row 5).

import type { TrustRowView } from "@halonicjs/studio-feature-workspace";

type Line = TrustRowView["lines"][number];

/** A label's lines: the first carries the label, the ones after it continue it. */
interface Field {
  readonly label: string;
  readonly values: readonly string[];
}

/**
 * The program's row as it is now, with what changed since it was trusted: the command it had, and
 * on each line the value it had or that it's new. The row keeps every line, so the person still
 * sees the whole program. A field it no longer has shows nothing: a removal can't let the
 * workspace do more, as in the rest of "What changed".
 *
 * @example
 * changedProgramRow(now, before).lines;
 * // [["Environment", "NODE_OPTIONS=--require ./other.js", "code", { was: "NODE_OPTIONS=--require ./setup.js" }]]
 */
export function changedProgramRow(now: TrustRowView, before: TrustRowView): TrustRowView {
  const fieldsBefore = new Map(fieldsOf(before.lines).map((field) => [field.label, field.values]));
  const fieldsNow = new Map(fieldsOf(now.lines).map((field) => [field.label, field.values]));
  let label = "";
  const lines = now.lines.map((line): Line => {
    if (line[0] !== "") label = line[0];
    const change = changeOf(line[1], fieldsNow.get(label) ?? [], fieldsBefore.get(label));
    return change === undefined ? line : [line[0], line[1], line[2], change];
  });
  return {
    ...now,
    lines,
    ...(before.detail === now.detail ? {} : { detailWas: before.detail }),
  };
}

/**
 * What changed in one value of a field: nothing when the field had it; the value it had when the
 * field holds one value both times, or an `env` entry of the same name had another; else it's new.
 */
function changeOf(
  value: string,
  values: readonly string[],
  was: readonly string[] | undefined,
): Line[3] {
  if (was === undefined) return "added";
  if (was.includes(value)) return undefined;
  const [only] = was;
  if (values.length === 1 && was.length === 1 && only !== undefined) return { was: only };
  const name = entryName(value);
  const sameName = name === undefined ? undefined : was.find((old) => entryName(old) === name);
  return sameName === undefined ? "added" : { was: sameName };
}

/** `NODE_OPTIONS` of `NODE_OPTIONS=--require ./setup.js`; `undefined` for a value without `=`. */
function entryName(value: string): string | undefined {
  const at = value.indexOf("=");
  return at > 0 ? value.slice(0, at) : undefined;
}

function fieldsOf(lines: readonly Line[]): Field[] {
  const fields: { label: string; values: string[] }[] = [];
  for (const [label, value] of lines) {
    const last = fields.at(-1);
    if (label === "" && last !== undefined) last.values.push(value);
    else fields.push({ label, values: [value] });
  }
  return fields;
}
