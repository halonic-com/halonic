import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, beforeAll, expect, it } from "vitest";
import { stageCli } from "./stage-cli.ts";

// Packs the CLI the way the release does and installs the tarball into a
// fresh folder outside the workspace. The sandbox runtime travels inside the
// tarball, so the install needs no network.

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const scratch = mkdtempSync(join(tmpdir(), "stage-cli-"));
const consumer = join(scratch, "consumer");
const version = "0.1.0-test.1";
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

function run(command: string, args: string[], cwd: string) {
  return spawnSync(command, args, { cwd, encoding: "utf8" });
}

function runOk(command: string, args: string[], cwd: string): string {
  const result = run(command, args, cwd);
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed:\n${result.stdout}${result.stderr}`);
  }
  return result.stdout;
}

beforeAll(async () => {
  if (!existsSync(join(root, "packages/adapters/integration-runner/dist/runner.mjs"))) {
    runOk("pnpm", ["--filter", "@halonicjs/adapter-integration-runner", "build"], root);
  }
  const staged = await stageCli(root, version, join(scratch, "cli"));
  const tarballs = join(scratch, "tarballs");
  mkdirSync(tarballs);
  const tarball = runOk(
    "npm",
    ["pack", "--silent", "--pack-destination", tarballs],
    staged.directory,
  )
    .trim()
    .split("\n")
    .at(-1);
  mkdirSync(consumer);
  writeFileSync(join(consumer, "package.json"), '{ "private": true }\n');
  runOk(
    "npm",
    ["install", join(tarballs, String(tarball)), "--offline", "--no-audit", "--no-fund"],
    consumer,
  );
}, 240_000);

const halonic = () => join(consumer, "node_modules/halonic/bin/halonic.js");

verifies("publish.staged-cli", () => {
  it("prints the staged version from the installed package", () => {
    expect(runOk(process.execPath, [halonic(), "--version"], consumer).trim()).toBe(
      `Halonic ${version}`,
    );
  }, 60_000);

  it("runs doctor to the end from the installed package", () => {
    const result = run(process.execPath, [halonic(), "doctor"], consumer);
    expect(result.status === 0 || result.status === 1).toBe(true);
    expect(result.stdout).toContain(`Halonic ${version}`);
    expect(result.stdout).toContain("Disk");
  }, 60_000);

  it("copies the example from the package's own examples folder", () => {
    runOk(process.execPath, [halonic(), "init", "--example", "acme", "copy"], consumer);
    expect(readFileSync(join(consumer, "copy/workspace.yaml"), "utf8").length).toBeGreaterThan(0);
  }, 60_000);

  it("carries the runner file and the patched sandbox runtime, and no TypeScript", () => {
    const installed = join(consumer, "node_modules/halonic");
    expect(existsSync(join(installed, "dist/runner.mjs"))).toBe(true);
    expect(
      existsSync(join(installed, "node_modules/@anthropic-ai/sandbox-runtime/dist/cli.js")),
    ).toBe(true);
    expect(existsSync(join(installed, "src"))).toBe(false);
  });

  it("refuses to stage when the runner file isn't built", async () => {
    await expect(stageCli(scratch, version, join(scratch, "never"))).rejects.toThrow(
      "pnpm --filter @halonicjs/adapter-integration-runner build",
    );
  });
});
