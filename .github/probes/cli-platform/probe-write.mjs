// Tries to write one file in the working folder and one in the home folder,
// and prints which writes worked. Under a working workspace-write sandbox the
// home write fails.
import { rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

for (const [name, path] of [
  ["inside", join(process.cwd(), "probe-inside.txt")],
  ["outside", join(homedir(), "probe-outside.txt")],
]) {
  try {
    writeFileSync(path, "x");
    rmSync(path);
    console.log(`${name}-write: ALLOWED`);
  } catch (error) {
    console.log(`${name}-write: BLOCKED (${error.code})`);
  }
}
