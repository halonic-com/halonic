import { writeFileSync } from "node:fs";
import { checkPrograms } from "../src/build/program-signatures.ts";

/**
 * `node apps/agent-host/scripts/check-signatures.ts <folder> [<list>]`: checks every
 * Windows program and DLL in the folder, such as an unpacked installer, and
 * fails when one has a security directory that holds no signature, as a
 * program changed after signing does (HAL-20055). Unsigned passes: our own
 * programs ship unsigned (HAL-16758). With <list>, it writes the path of every
 * program it found there, one per line: build-installer.ps1 asks Authenticode
 * whether each of those signatures is valid, whatever the file's name.
 */

const [folder, list] = process.argv.slice(2);
if (folder === undefined) {
  throw new Error("usage: check-signatures.ts <folder> [<list>]");
}

const results = checkPrograms(folder);
if (list !== undefined) {
  writeFileSync(list, results.map(({ path }) => `${path}\n`).join(""));
}
for (const { path, ok, detail } of results) {
  console.log(`${ok ? "ok  " : "FAIL"} ${path}: ${detail}`);
}
const failed = results.filter(({ ok }) => !ok).length;
if (results.length === 0) {
  console.error(`No Windows programs in ${folder}.`);
  process.exitCode = 1;
} else if (failed > 0) {
  console.error(`${failed} of ${results.length} programs have a broken security directory.`);
  process.exitCode = 1;
} else {
  console.log(`All ${results.length} programs have an empty security directory or a certificate.`);
}
