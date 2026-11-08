import { type IssueCode, type Path, parse } from "@halonicjs/schema-kit";
import { err, ok, type Result } from "@halonicjs/std";
import { checkIntegrationSheet } from "./kind.ts";
import { IntegrationSheet } from "./schema.ts";

/** Why a sheet was refused: a schema issue code, or the code of one of the sheet's own checks. */
export interface SheetProblem {
  readonly code: IssueCode | string;
  readonly path: Path;
  readonly message: string;
}

/**
 * Checks a permission sheet that is already data, such as the JSON the build
 * writes next to an integration, with the same schema and checks as
 * `parseFile`. For a loader that must not read YAML.
 *
 * @example
 * const sheet = parseIntegrationSheet(JSON.parse(text));
 * if (!sheet.ok) refuse(sheet.error);
 */
export function parseIntegrationSheet(value: unknown): Result<IntegrationSheet, SheetProblem[]> {
  const parsed = parse(IntegrationSheet, value);
  if (!parsed.ok) {
    return err(parsed.error.map(({ code, path, message }) => ({ code, path, message })));
  }
  const problems = checkIntegrationSheet(parsed.value).filter(
    (problem) => problem.severity === "error",
  );
  if (problems.length > 0) {
    return err(problems.map(({ code, path, message }) => ({ code, path, message })));
  }
  return ok(parsed.value);
}
