import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { stageCli } from "../stage-cli.ts";

/**
 * Builds the publishable copy of the `halonic` CLI package for the version
 * given: `pnpm --filter @halonicjs/tooling-publish run stage-cli 0.1.0`.
 * Prints the staged folder, name and version.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const version = process.argv[2];
if (version === undefined || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error("Usage: stage-cli <version>, for example stage-cli 0.1.0");
  process.exit(2);
}
const staged = await stageCli(root, version);
console.log(`stage-cli: ${staged.name}@${staged.version} -> ${staged.directory}`);
