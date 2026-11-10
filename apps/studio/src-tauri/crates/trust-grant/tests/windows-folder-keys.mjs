// B6 (HAL-2612, HAL-3747): the CLI's side of the Windows folder keys. The
// CLI keys a trust record by Node's `realpath` of the workspace folder
// (apps/cli/src/workspace-trust.ts); the shell keys it by `canonicalize`,
// then `plain_path` (windows_folder_keys.rs). Both check the same golden
// file, so a folder given in another case or by its 8.3 short name gets the
// same key from both. Exit code 0 means every case held.
//
// Run on Windows only, from anywhere. HALONIC_FOLDER_KEYS_ROOT names a
// folder on a volume with 8.3 names on (the CI step makes one); there every
// case must hold. Without it the 8.3 cases are left out, with a note, when
// the temporary folder's volume makes no short names.
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "win32") {
  console.error("The Windows folder keys can only be checked on Windows.");
  process.exit(2);
}

const golden = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "fixtures/windows-folder-keys.json"),
    "utf8",
  ),
);
const required = process.env.HALONIC_FOLDER_KEYS_ROOT !== undefined;
const root = join(
  process.env.HALONIC_FOLDER_KEYS_ROOT ?? tmpdir(),
  `folder-keys-cli-${process.pid}`,
);
rmSync(root, { recursive: true, force: true });
const folders = join(root, "folders");
for (const folder of golden.folders) {
  mkdirSync(join(folders, folder), { recursive: true });
}

let failed = 0;
try {
  const shortNames = golden.cases
    .filter((c) => c.shortName)
    .every((c) => existsSync(join(folders, c.given)));
  if (!shortNames) {
    if (required) {
      failed += 1;
      console.error(
        `FAIL no 8.3 short names under ${root}: the volume has them off (fsutil 8dot3name query)`,
      );
    } else {
      console.log(`note: no 8.3 short names under ${root}, so the 8.3 cases are left out`);
    }
  }
  const rootKey = await realpath(folders);
  for (const c of golden.cases.filter((c) => shortNames || !c.shortName)) {
    const key = await realpath(join(folders, c.given));
    const expected = `${rootKey}\\${c.key}`;
    if (key === expected) {
      console.log(`ok   ${c.name}: ${c.given} -> ${c.key}`);
    } else {
      failed += 1;
      console.error(`FAIL ${c.name}: ${c.given} -> ${key}, expected ${expected}`);
    }
  }
} finally {
  rmSync(root, { recursive: true, force: true });
}
console.log(
  `Node ${process.version}: ${failed === 0 ? "every case held" : `${failed} case(s) failed`}`,
);
process.exit(failed === 0 ? 0 : 1);
