import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";

/** The `halonic` command's first file, which checks the Node version. */
const launcher = fileURLToPath(new URL("../bin/halonic.cjs", import.meta.url));

/** Runs the launcher with `args` on this Node, which says it is `version`. */
function launchAs(version: string, args: readonly string[]) {
  // Swaps `process.versions` before the launcher reads it, then loads it as `halonic` would.
  const fake = `Object.defineProperty(process, "versions", { value: { ...process.versions, node: ${JSON.stringify(version)} } });
process.argv.splice(1, 0, ${JSON.stringify(launcher)});
require(${JSON.stringify(launcher)});`;
  return spawnSync(process.execPath, ["--eval", fake, "--", ...args], { encoding: "utf8" });
}

verifies("cli.node-version", () => {
  it("refuses an older Node with one line naming it and how to get a newer one", () => {
    const run = launchAs("18.19.1", ["--help"]);

    expect(run.stderr).toBe(
      "✕ Halonic needs Node.js 26.12 or later, but this is Node.js 18.19.1. " +
        "Install a newer one with nvm or fnm, for example: nvm install 26\n",
    );
    expect(run.stdout).toBe("");
    expect(run.status).toBe(1);
  });

  it("refuses 26.11, the minor version before the one it needs", () => {
    const run = launchAs("26.11.0", ["--help"]);

    expect(run.stderr).toContain("but this is Node.js 26.11.0.");
    expect(run.status).toBe(1);
  });

  it("runs the command line on 26.12", () => {
    const run = launchAs("26.12.0", ["--help"]);

    expect(run.stdout).toContain("Run and check Halonic workspaces from the command line.");
    expect(run.status).toBe(0);
  });

  it("is what package.json starts, and asks for Node 26.12 or later", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

    expect(pkg.bin).toEqual({ halonic: "./bin/halonic.cjs" });
    expect(pkg.engines).toEqual({ node: ">=26.12" });
  });

  it("uses no syntax Node 12 can't read", () => {
    const source = readFileSync(launcher, "utf8");
    const code = source.replace(/^\s*\/\/.*$/gm, "");

    expect(source.startsWith("#!/usr/bin/env node\n")).toBe(true);
    expect(code).not.toMatch(/\?\.|\?\?|^\s*await\b/m);
  });
});
