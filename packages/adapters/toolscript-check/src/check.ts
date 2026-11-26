import { checkHeader, type Header, type HeaderCheckContext } from "@halonicjs/toolscript";
import ts from "@typescript/typescript6";
import { checkCode } from "./code-rules.ts";
import { messages, type Problem } from "./messages.ts";
import { checkShape } from "./shape-rules.ts";
import { checkSize, checkSuppressions } from "./size-rules.ts";
import { Problems, parseToolScript } from "./source.ts";
import { compilerOptions, normalizeSource } from "./strip-types.ts";

/** What `checkToolScript` needs besides the source. */
export interface CheckOptions {
  /** Shown in problems and used by the parser; such as `sync.tool.ts`. */
  readonly fileName: string;
  /** The risk of a capability in the host's registry; the checker imports no registry (S5). */
  readonly riskOf: HeaderCheckContext["riskOf"];
}

/** The checked header, or every problem in file order. */
export type CheckResult =
  | { readonly ok: true; readonly header: Header; readonly hasRun: boolean }
  | { readonly ok: false; readonly problems: Problem[] };

function checkSyntax(source: string, fileName: string, problems: Problems): void {
  const output = ts.transpileModule(source, { fileName, compilerOptions, reportDiagnostics: true });
  for (const diagnostic of output.diagnostics ?? []) {
    const text = ts.flattenDiagnosticMessageText(diagnostic.messageText, " ");
    problems.add("syntax", messages.syntax(text), diagnostic.start ?? 0);
  }
}

/**
 * Checks a ToolScript against the profile rules P1–P7 and its header against
 * the T2 schema, from the syntax tree alone: nothing in it runs. This helps
 * authors and reviewers; the isolate is the boundary (HAL-17560, 1.3).
 *
 * @example
 * const result = checkToolScript(source, { fileName: "sync.tool.ts", riskOf });
 * if (!result.ok) for (const problem of result.problems) print(problem.message);
 */
export function checkToolScript(source: string, options: CheckOptions): CheckResult {
  const text = normalizeSource(source);
  const file = parseToolScript(text, options.fileName);
  const problems = new Problems(file);
  checkSyntax(text, options.fileName, problems);
  const shape = checkShape(file, problems);
  checkCode(file, problems);
  checkSize(file, problems);
  checkSuppressions(file, problems);
  if (shape.header === undefined) return { ok: false, problems: problems.sorted() };
  const header = checkHeader(shape.header, { riskOf: options.riskOf, hasRun: shape.hasRun });
  if (!header.ok) {
    for (const reason of header.reasons)
      problems.add("header", messages.header(reason), shape.headerAt);
  }
  if (!header.ok || problems.count > 0) return { ok: false, problems: problems.sorted() };
  return { ok: true, header: header.header, hasRun: shape.hasRun };
}
