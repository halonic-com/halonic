import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

const SHELL_IMPORT = /(?:from|import)\s*\(?\s*["']@halonicjs\/studio-shell/;

// The phone's screens run in the Android app, where the desktop shell doesn't exist (HAL-15151).
it("nothing under src/phone imports the desktop shell", () => {
  const dir = import.meta.dirname;
  const offenders = readdirSync(dir)
    .filter((name) => name.endsWith(".ts") || name.endsWith(".tsx"))
    .filter((name) => SHELL_IMPORT.test(readFileSync(join(dir, name), "utf8")));
  expect(offenders).toEqual([]);
});
