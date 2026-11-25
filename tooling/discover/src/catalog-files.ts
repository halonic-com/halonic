import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  type CheckContext,
  catalogFile,
  expectedCatalogFile,
  formatProblem,
  readHashedCatalogs,
} from "@halonicjs/tooling-check";

/**
 * Writes each hashed catalog's committed `src/catalog.generated.ts`: every
 * `src/<group>/<name>.ts` with its source hash. Only `pnpm discover --fix`
 * calls it, because the file is committed and `pnpm check` compares it.
 *
 * @returns the files that changed, relative to the repo root
 */
export function writeCatalogFiles(context: CheckContext): string[] {
  const { catalogs, report } = readHashedCatalogs(context);
  const written: string[] = [];
  for (const catalog of catalogs) {
    const file = `${catalog.packageDirectory}/${catalogFile}`;
    const path = join(context.root, file);
    const text = expectedCatalogFile(context, catalog, report);
    if (existsSync(path) && readFileSync(path, "utf8") === text) continue;
    writeFileSync(path, text);
    written.push(file);
  }
  for (const problem of report.problems) {
    console.log(formatProblem(problem));
  }
  return written;
}
