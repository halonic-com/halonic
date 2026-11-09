import { join } from "node:path";
import { compareFile, fileChecks, type NewResult } from "../src/index.ts";

/** The fixtures that ship with this package: a valid base workspace and made-up faulty cases. */
const fixtures = join(import.meta.dirname, "../fixtures");

/** Compares what new code says about one fixture file against the old repo's golden recording. */
export function runExample(): string[] {
  // The "agent/unknown-key" case: a method with a key the schema doesn't know.
  const check = fileChecks(fixtures).find((file) => file.name.startsWith("agent/unknown-key: "));
  if (check === undefined) throw new Error("the fixture is missing");

  // What the golden recording holds for the file: the old repo failed it on `methods.extract`, line 13.
  const [golden] = check.recorded.issues;

  // New code that reports exactly the golden error. In a real parity test this is `parseFile(kind, text)`.
  const sameError: NewResult = {
    ok: false,
    error: [
      {
        severity: "error",
        source: "schema",
        code: golden?.code ?? "",
        path: golden?.path ?? [],
        line: golden?.line ?? 0,
        col: golden?.col ?? 0,
      },
    ],
  };
  // New code that reports the same error one line further down: the compare is exact, so this differs.
  const movedError: NewResult = {
    ok: false,
    error: sameError.ok
      ? []
      : sameError.error.map((problem) => ({ ...problem, line: problem.line + 1 })),
  };

  const same = compareFile(check, sameError);
  const moved = compareFile(check, movedError);
  return [
    `${check.name}: golden says ${golden?.code} at line ${golden?.line}`,
    `same error: ${same.same ? "matches" : "differs"}`,
    `error one line further down: ${moved.same ? "matches" : "differs"}`,
  ];
}
