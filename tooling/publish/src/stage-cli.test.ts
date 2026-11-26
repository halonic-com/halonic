import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, beforeAll, expect, it } from "vitest";
import { resolvedPackages, stageCli } from "./stage-cli.ts";

// Packs the CLI the way the release does and installs the tarball into a
// fresh folder outside the workspace. The sandbox runtime travels inside the
// tarball, so the install needs no network.

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
let stagedDirectory = "";
const scratch = mkdtempSync(join(tmpdir(), "stage-cli-"));
const consumer = join(scratch, "consumer");
const version = "0.1.0-test.1";
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

// pnpm runs the tests with NODE_PATH set to the workspace's node_modules and a NODE_OPTIONS resolve
// hook that falls back to it, so the installed CLI found the workspace packages the tarball lacks
// and `--version` passed while the published CLI crashed (HAL-19380, HAL-19423). A user's shell
// has neither.
const { NODE_PATH: _nodePath, NODE_OPTIONS: _nodeOptions, ...userEnv } = process.env;

function run(command: string, args: string[], cwd: string) {
  return spawnSync(command, args, { cwd, encoding: "utf8", env: userEnv });
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
  const notices = join(scratch, "THIRD-PARTY-NOTICES.txt");
  writeFileSync(notices, "notices\n");
  const staged = await stageCli(root, version, notices, join(scratch, "cli"));
  stagedDirectory = staged.directory;
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
  // An examples folder around the installed package, where the repository's would be from
  // `dist/cli`: the package must copy its own example, never this one.
  cpSync(join(root, "examples/acme"), join(scratch, "examples/acme"), { recursive: true });
  writeFileSync(join(scratch, "examples/acme/workspace.yaml"), "name: Not the package's\n");
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

  it("lists the board-approved npm keywords in the installed manifest", () => {
    const manifest = JSON.parse(
      readFileSync(join(consumer, "node_modules/halonic/package.json"), "utf8"),
    ) as { keywords: string[] };
    expect(manifest.keywords).toContain("local-first");
    expect(manifest.keywords).not.toContain("mcp");
  });

  it("carries the runner file and the patched sandbox runtime, and no TypeScript", () => {
    const installed = join(consumer, "node_modules/halonic");
    expect(existsSync(join(installed, "dist/runner.mjs"))).toBe(true);
    expect(
      existsSync(join(installed, "node_modules/@anthropic-ai/sandbox-runtime/dist/cli.js")),
    ).toBe(true);
    expect(existsSync(join(installed, "src"))).toBe(false);
  });

  it("leaves out an optional dependency the workspace doesn't install, so npm won't fetch it", () => {
    const runtime = join(
      consumer,
      "node_modules/halonic/node_modules/@anthropic-ai/sandbox-runtime",
    );
    const manifest = JSON.parse(readFileSync(join(runtime, "package.json"), "utf8")) as {
      optionalDependencies?: Record<string, string>;
    };
    expect(Object.keys(manifest.optionalDependencies ?? {})).not.toContain("@microsoft/mxc-sdk");
    expect(existsSync(join(consumer, "node_modules/@microsoft/mxc-sdk"))).toBe(false);
  });

  it("carries the third-party notices", () => {
    expect(
      readFileSync(join(consumer, "node_modules/halonic/THIRD-PARTY-NOTICES.txt"), "utf8"),
    ).toBe("notices\n");
  });

  it("carries the README for users, not the CLI's notes for its developers", () => {
    const readme = readFileSync(join(consumer, "node_modules/halonic/README.md"), "utf8");
    expect(readme).toContain("npm i -g halonic");
    expect(readme).toContain("https://docs.halonic.dev/getting-started");
    expect(readme).not.toContain("**Layer:**");
  });

  it("runs the installed package where the workspace's packages can't be found", () => {
    const probe = join(consumer, "node_modules/halonic/dist/cli/probe.mjs");
    writeFileSync(probe, 'import.meta.resolve("@halonicjs/target-paperclip-runtime/actions");\n');
    const result = run(process.execPath, [probe], consumer);
    rmSync(probe);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("ERR_MODULE_NOT_FOUND");
  });

  it("never resolves a workspace package when the bundle loads (HAL-19380)", () => {
    const bundle = readFileSync(join(stagedDirectory, "dist/cli/main.js"), "utf8");
    expect(bundle).not.toMatch(/import\.meta\.resolve\(\s*["']@halonicjs\//);
  });

  it("finds what a bundle resolves with import.meta.resolve, Node's own modules left out", () => {
    const bundle = [
      'import.meta.resolve("@halonicjs/target-paperclip-runtime/actions");',
      "import.meta.resolve('node:fs');",
      'import.meta.resolve( "acme-lib");',
      "import.meta.resolve(name);",
    ].join("\n");
    expect(resolvedPackages(bundle)).toEqual([
      "@halonicjs/target-paperclip-runtime/actions",
      "acme-lib",
      "<computed>",
    ]);
  });

  it("refuses to stage a CLI whose bundle resolves a package with import.meta.resolve", async () => {
    const fakeRoot = join(scratch, "resolving-root");
    const source = join(fakeRoot, "apps/cli/src");
    mkdirSync(source, { recursive: true });
    for (const name of ["version.ts", "npm-package.ts", "runtime-worker.ts"]) {
      writeFileSync(join(source, name), "export {};\n");
    }
    writeFileSync(
      join(source, "main.ts"),
      [
        'import { halonicVersion } from "./version.ts";',
        'import { inNpmPackage } from "./npm-package.ts";',
        'import { runtimeWorkerUrl } from "./runtime-worker.ts";',
        'console.log(halonicVersion, inNpmPackage, runtimeWorkerUrl(), import.meta.resolve("acme-lib"));',
      ].join("\n"),
    );
    const runner = join(fakeRoot, "packages/adapters/integration-runner/dist/runner.mjs");
    mkdirSync(dirname(runner), { recursive: true });
    writeFileSync(runner, "export {};\n");
    await expect(
      stageCli(fakeRoot, version, join(scratch, "THIRD-PARTY-NOTICES.txt"), join(scratch, "never")),
    ).rejects.toThrow("The CLI bundle imports acme-lib, which Node doesn't provide.");
  });

  it("refuses to stage when the notices file is missing", async () => {
    await expect(
      stageCli(root, version, join(scratch, "none.txt"), join(scratch, "never")),
    ).rejects.toThrow("check:sbom --notices");
  });

  it("refuses to stage when the runner file isn't built", async () => {
    await expect(
      stageCli(scratch, version, join(scratch, "THIRD-PARTY-NOTICES.txt"), join(scratch, "never")),
    ).rejects.toThrow("pnpm --filter @halonicjs/adapter-integration-runner build");
  });
});

verifies("publish.staged-cli-package-folders", () => {
  it("copies the package's own example when an examples folder is around the package", () => {
    runOk(process.execPath, [halonic(), "init", "--example", "acme", "own"], consumer);
    expect(readFileSync(join(consumer, "own/workspace.yaml"), "utf8")).toBe(
      readFileSync(join(root, "examples/acme/workspace.yaml"), "utf8"),
    );
  }, 60_000);
});
