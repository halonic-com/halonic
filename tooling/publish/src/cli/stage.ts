import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveFolder, stagePackage } from "../stage.ts";

/**
 * Builds the publishable copy of each package folder given: `pnpm
 * --filter <package> build` runs it for one package. Prints the staged
 * folder, name and version.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const folders = process.argv.slice(2);
if (folders.length === 0) {
  console.error("stage: give at least one package folder.");
  process.exitCode = 1;
}
for (const folder of folders) {
  const staged = stagePackage(root, resolveFolder(folder));
  console.log(`stage: ${staged.name}@${staged.version} -> ${staged.directory}`);
}
