import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { expandWorkspaceGlob, listWorkspacePackages, readWorkspaceGlobs } from "./workspace.ts";

function globsOf(yaml: string): string[] {
  const root = mkdtempSync(join(tmpdir(), "halonic-workspace-"));
  try {
    writeFileSync(join(root, "pnpm-workspace.yaml"), yaml);
    return readWorkspaceGlobs(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("readWorkspaceGlobs", () => {
  it("reads an indented block list up to the next key", () => {
    const yaml =
      "packages:\n  - apps/*\n  # a comment\n\n  - 'tooling/*' # quoted\ncatalog:\n  a: 1\n";
    expect(globsOf(yaml)).toEqual(["apps/*", "tooling/*"]);
  });

  it("reads items at column 0, which pnpm also accepts", () => {
    expect(globsOf("packages:\n- apps/*\n- packages/host\nallowBuilds: {}\n")).toEqual([
      "apps/*",
      "packages/host",
    ]);
  });

  it("throws on a flow-style list instead of seeing no packages", () => {
    expect(() => globsOf("packages: [apps/*, tooling/*]\n")).toThrow(/not a block list/);
  });

  it("throws on a line it can't read", () => {
    expect(() => globsOf("packages:\n  - apps/*\n  - [tooling/*]\n")).toThrow(/line 3/);
  });

  it("throws when packages is missing or empty", () => {
    expect(() => globsOf("packages:\n\ncatalog: {}\n")).toThrow(/lists no folders/);
    expect(() => globsOf("catalog: {}\n")).toThrow(/is missing/);
  });
});

describe("workspace globs", () => {
  let root = "";

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "halonic-workspace-"));
    writeFileSync(
      join(root, "pnpm-workspace.yaml"),
      "packages:\n  - packages/host/*\n  - packages/targets/*/*\n\ncatalog: {}\n",
    );
    writeFileSync(join(root, "package.json"), '{ "name": "@halonicjs/root" }');
    for (const directory of [
      "packages/host/server",
      "packages/targets/node/runtime",
      "packages/targets/cloudflare/runtime",
      "packages/targets/cloudflare/deploy",
    ]) {
      mkdirSync(join(root, directory), { recursive: true });
      writeFileSync(join(root, directory, "package.json"), "{}");
    }
    writeFileSync(join(root, "packages/targets/README.md"), "");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("expands one * per folder level", () => {
    expect(expandWorkspaceGlob(root, "packages/targets/*/*").sort()).toEqual([
      "packages/targets/cloudflare/deploy",
      "packages/targets/cloudflare/runtime",
      "packages/targets/node/runtime",
    ]);
    expect(expandWorkspaceGlob(root, "packages/missing/*")).toEqual([]);
  });

  it("lists packages from two-level globs, the root first", () => {
    expect(listWorkspacePackages(root).map((pkg) => pkg.directory)).toEqual([
      ".",
      "packages/host/server",
      "packages/targets/cloudflare/deploy",
      "packages/targets/cloudflare/runtime",
      "packages/targets/node/runtime",
    ]);
  });

  it("skips dot-folders and refuses ..", () => {
    mkdirSync(join(root, "packages/targets/.hidden"), { recursive: true });
    expect(expandWorkspaceGlob(root, "packages/targets/*")).not.toContain(
      "packages/targets/.hidden",
    );
    expect(() => expandWorkspaceGlob(root, "../*")).toThrow("can't use");
  });

  it.each(["packages/**", "packages/host-*", "packages/{a,b}"])("refuses %s", (glob) => {
    expect(() => expandWorkspaceGlob(root, glob)).toThrow("Unsupported workspace glob");
  });
});
