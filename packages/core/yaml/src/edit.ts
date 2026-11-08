import { deepEqual, err, ok, type Result } from "@halonicjs/std";
import { isCollection, isNode, isPair, isScalar, isSeq, type Node, parseDocument } from "yaml";
import { applyEditToData, checkValue, type YamlEdit } from "./edit-data.ts";
import { lineEndingOf } from "./edit-text.ts";
import type { YamlProblem } from "./problem.ts";
import { defaultYamlLimits, readYaml, type YamlLimits, type YamlPath } from "./read.ts";
import { spliceEdit } from "./splice.ts";
import { writeYamlFile } from "./write.ts";

/** An edit that doesn't fit the data, or would give a file `readYaml` rejects. */
export interface YamlEditProblem {
  readonly kind: "bad-edit";
  /** The index of the edit in the list passed to `editYaml`. */
  readonly edit: number;
  /** One line that says what is wrong. */
  readonly message: string;
}

/**
 * How much of the file's layout an edit kept:
 * - `kept`: only the edited text changed; every comment and line elsewhere stayed.
 * - `reformatted`: the file was rendered again from the parsed document. Comments
 *   stay, but spacing and some quoting may change.
 * - `rewritten`: the file was written from its data with `writeYamlFile`. Every
 *   comment is gone; warn before saving this.
 */
export type YamlLayout = "kept" | "reformatted" | "rewritten";

/** The text after `editYaml`, and how much of its layout was kept. */
export interface YamlEdited {
  readonly text: string;
  readonly layout: YamlLayout;
}

/**
 * Applies edits to a YAML text and keeps everything they don't touch: comments,
 * key order, quoting, blank lines. Edits run in order; each sees the result
 * of the one before. After each edit the text is read back and must give the
 * expected data; when the splice can't manage that, the edit falls back to a
 * `reformatted` and then a `rewritten` layout, so the data is always right.
 *
 * @param text - the whole file
 * @param edits - the changes, applied in order
 * @param limits - the same limits as `readYaml`; they apply to the result too
 * @returns the new text and its layout; or the problem `readYaml` gives for an
 *   unreadable `text`; or a `bad-edit` for the first edit that doesn't fit, with
 *   no edit applied
 *
 * @example
 * const edited = editYaml("name: Billing # shown in the list\n", [
 *   { kind: "set", path: ["name"], value: "Invoices" },
 * ]);
 * // { ok: true, value: { text: "name: Invoices # shown in the list\n", layout: "kept" } }
 */
export function editYaml(
  text: string,
  edits: readonly YamlEdit[],
  limits: YamlLimits = defaultYamlLimits,
): Result<YamlEdited, YamlProblem | YamlEditProblem> {
  const read = readYaml(text, limits);
  if (!read.ok) {
    return read;
  }
  let current: Step = { text, data: read.value.data, layout: "kept" };
  for (const [index, edit] of edits.entries()) {
    const step = applyEdit(current, edit, limits);
    if (!step.ok) {
      return err({ kind: "bad-edit", edit: index, message: step.error });
    }
    current = { ...step.value, layout: worseLayout(current.layout, step.value.layout) };
  }
  return ok({ text: current.text, layout: current.layout });
}

interface Step {
  readonly text: string;
  readonly data: unknown;
  readonly layout: YamlLayout;
}

const layoutOrder: readonly YamlLayout[] = ["kept", "reformatted", "rewritten"];

function worseLayout(first: YamlLayout, second: YamlLayout): YamlLayout {
  return layoutOrder.indexOf(first) >= layoutOrder.indexOf(second) ? first : second;
}

function applyEdit(before: Step, edit: YamlEdit, limits: YamlLimits): Result<Step, string> {
  const valueProblem = edit.kind === "delete" ? undefined : checkValue(edit.value, limits.maxDepth);
  if (valueProblem !== undefined) {
    return err(valueProblem);
  }
  const expected = applyEditToData(before.data, edit);
  if (!expected.ok) {
    return expected;
  }
  if (deepEqual(expected.value, before.data)) {
    return ok({ text: before.text, data: before.data, layout: "kept" });
  }
  const attempts: [YamlLayout, () => string | undefined][] = [
    ["kept", () => spliceEdit(before.text, edit)],
    ["reformatted", () => renderWithDocument(before.text, edit, expected.value)],
    ["rewritten", () => writeYamlFile(expected.value)],
  ];
  for (const [layout, attempt] of attempts) {
    const text = attempt();
    if (text === undefined) {
      continue;
    }
    const readBack = readYaml(text, limits);
    if (
      !readBack.ok &&
      (readBack.error.kind === "too-deep" || readBack.error.kind === "too-large")
    ) {
      return err(readBack.error.message);
    }
    if (readBack.ok && deepEqual(readBack.value.data, expected.value)) {
      return ok({ text, data: expected.value, layout });
    }
  }
  return err("The new value doesn't read back the same from YAML.");
}

/**
 * The first fallback: the same edit through the yaml library's Document API,
 * rendered again. Comments stay; spacing may not.
 */
function renderWithDocument(text: string, edit: YamlEdit, expected: unknown): string | undefined {
  const document = parseDocument(text);
  const { path } = edit;
  if (edit.kind === "delete") {
    document.deleteIn(path);
  } else if (edit.kind === "insert") {
    const list = document.getIn(path.slice(0, -1), true);
    if (!isSeq(list)) {
      return undefined;
    }
    list.items.splice(path[path.length - 1] as number, 0, document.createNode(edit.value));
  } else {
    const existing = document.getIn(path, true);
    if (isScalar(existing) && (edit.value === null || typeof edit.value !== "object")) {
      // Change the scalar in place, so a comment on its line stays.
      existing.value = edit.value;
      return render(text, document);
    }
    // Set from the first key that is missing or empty, so the maps under it are created too.
    const from = firstEmpty(document, path);
    const value = document.createNode(valueAt(expected, path.slice(0, from)));
    if (from === 0) {
      const top = topCommentNode(document.contents);
      if (top?.commentBefore) {
        value.commentBefore = top.commentBefore;
      }
      if (top?.spaceBefore) {
        value.spaceBefore = true;
      }
      document.contents = value as typeof document.contents;
    } else {
      document.setIn(path.slice(0, from), value);
    }
  }
  return render(text, document);
}

function render(text: string, document: ReturnType<typeof parseDocument>): string {
  const lines = document.toString({ lineWidth: 100 });
  // The library writes `\n` and drops a byte order mark; Windows editors expect both back.
  const rendered = lineEndingOf(text) === "\r\n" ? lines.replaceAll("\n", "\r\n") : lines;
  return text.startsWith(byteOrderMark) ? byteOrderMark + rendered : rendered;
}

const byteOrderMark = "\uFEFF";

/**
 * The node that holds the comment at the top of the file, which a whole-document `set`
 * must carry over. With a blank line after it, the comment is on the document and stays
 * by itself. Without one, the library hangs it on the first key or item, or on the contents.
 */
function topCommentNode(contents: Node | null): Node | undefined {
  if (contents?.commentBefore || !isCollection(contents)) {
    return contents ?? undefined;
  }
  const first: unknown = contents.items[0];
  const node = isPair(first) ? first.key : first;
  return isNode(node) ? node : undefined;
}

function firstEmpty(document: ReturnType<typeof parseDocument>, path: YamlPath): number {
  for (let length = 0; length < path.length; length++) {
    const node = length === 0 ? document.contents : document.getIn(path.slice(0, length), true);
    if (node === undefined || node === null || document.getIn(path.slice(0, length)) === null) {
      return length;
    }
  }
  return path.length;
}

function valueAt(data: unknown, path: YamlPath): unknown {
  let value = data;
  for (const key of path) {
    value = (value as Record<string | number, unknown>)[key];
  }
  return value;
}
