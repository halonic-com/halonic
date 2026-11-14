import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stageCli } from "../stage-cli.ts";

/**
 * Builds the publishable copy of the `halonic` CLI package for the version
 * given: `pnpm --filter @halonicjs/tooling-publish run stage-cli 0.1.0 dist/THIRD-PARTY-NOTICES.txt`.
 * Prints the staged folder, name and version.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const version = process.argv[2];
const notices = process.argv[3];
if (notices === undefined) {
  console.error("Usage: stage-cli <version> <THIRD-PARTY-NOTICES.txt>");
  process.exit(2);
}
if (version === undefined || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error("Usage: stage-cli <version>, for example stage-cli 0.1.0");
  process.exit(2);
}
const staged = await stageCli(root, version, resolve(notices));
console.log(`stage-cli: ${staged.name}@${staged.version} -> ${staged.directory}`);
