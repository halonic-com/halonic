import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { executableName } from "../src/build-sea.ts";

/**
 * Runs the built executable and checks what it prints, then reports its size.
 * `pnpm smoke:sea` runs after `pnpm build:sea`, on every system CI checks.
 */
const packageDirectory = join(import.meta.dirname, "..");
const { version } = JSON.parse(readFileSync(join(packageDirectory, "package.json"), "utf8")) as {
  version: string;
};
const executable = join(packageDirectory, "dist", executableName(process.platform));
const printed = execFileSync(executable, { encoding: "utf8" });
const expected = `halonic-agent-host ${version}\n`;
if (printed !== expected) {
  console.error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(printed)}.`);
  process.exitCode = 1;
} else {
  const megabytes = (statSync(executable).size / 1024 / 1024).toFixed(1);
  const compressed = (gzipSync(readFileSync(executable)).length / 1024 / 1024).toFixed(1);
  console.log(
    `OK: printed ${JSON.stringify(printed.trim())}; size ${megabytes} MB (${compressed} MB gzipped).`,
  );
}
