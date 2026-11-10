import ts from "@typescript/typescript6";
import type { CheckContext } from "../lib/context.ts";
import { Report } from "../lib/problems.ts";
import { isTestFile } from "../lib/source-files.ts";

/** The Studio kit, the one place that decides how a button stops working. */
const kitFolder = "packages/studio/kit/";

/**
 * Finds the lines (1-based) where a `<button>` in JSX has a native
 * `disabled` attribute, with or without a value.
 *
 * @example
 * findNativeDisabled("x.tsx", "<button disabled>Save</button>");
 * // [1]
 */
export function findNativeDisabled(fileName: string, text: string): number[] {
  const kind = fileName.endsWith(".jsx") ? ts.ScriptKind.JSX : ts.ScriptKind.TSX;
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind);
  const lines: number[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      node.tagName.getText(source) === "button"
    ) {
      for (const attribute of node.attributes.properties) {
        if (ts.isJsxAttribute(attribute) && attribute.name.getText(source) === "disabled") {
          lines.push(source.getLineAndCharacterOfPosition(attribute.getStart(source)).line + 1);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return lines;
}

/**
 * Fails on a native `disabled` attribute on `<button>` in JSX outside
 * `packages/studio/kit` (component specs 23, A1). A disabled button drops
 * focus and hides why it can't be used; the kit's Button takes
 * `unavailable={{ reason }}` instead, which keeps focus and shows the reason.
 * Tests are exempt: they may render one on purpose.
 */
export function checkNativeDisabled(context: CheckContext): Report {
  const report = new Report("native-disabled");
  for (const file of context.files) {
    if (!/\.[jt]sx$/.test(file) || file.startsWith(kitFolder) || isTestFile(file)) {
      continue;
    }
    for (const line of findNativeDisabled(file, context.read(file))) {
      report.error(
        file,
        "This <button> has a native disabled attribute, which takes its focus away and hides why it can't be used. Use the kit's Button with unavailable={{ reason }} instead (component specs 23, A1).",
        line,
      );
    }
  }
  return report;
}
