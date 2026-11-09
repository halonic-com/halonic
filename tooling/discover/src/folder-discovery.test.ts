import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { loadContext } from "@halonicjs/tooling-check";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type FolderDiscovery,
  generatedFolderFile,
  readFolderDiscoveries,
} from "./folder-discovery.ts";

const realRoot = join(import.meta.dirname, "..", "..", "..");
const engine = "packages/core/acme-engine";

const states: FolderDiscovery = {
  packageDirectory: engine,
  name: "states",
  folder: "src/states",
  file: "state.ts",
  suffix: "State",
  satisfies: { type: "StateRegistry", from: "src/kernel/registry.ts" },
};

describe("generatedFolderFile", () => {
  it("puts the generated file in the package's src/generated, named after the discovery", () => {
    expect(generatedFolderFile(states)).toBe(`${engine}/src/generated/states.ts`);
  });
});

describe("readFolderDiscoveries", () => {
  let root: string;
  const write = (path: string, text: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  const writeEngine = (discover: unknown): void => {
    write(
      `${engine}/package.json`,
      JSON.stringify({
        name: "@halonicjs/acme-engine",
        halonic: { layer: "core", owner: "elena", discover },
      }),
    );
  };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "halonic-discover-declared-"));
    for (const file of [
      "pnpm-workspace.yaml",
      "tooling/check/policy.json",
      "tooling/check/dependencies.json",
    ]) {
      write(file, readFileSync(join(realRoot, file), "utf8"));
    }
    write("package.json", JSON.stringify({ name: "@halonicjs/root" }));
    execFileSync("git", ["init", "-q"], { cwd: root });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("reads a declared discovery", () => {
    const { folder, file, suffix, satisfies } = states;
    writeEngine({ states: { folder, file, suffix, satisfies } });
    const { discoveries, problems } = readFolderDiscoveries(loadContext(root));
    expect(problems).toEqual([]);
    expect(discoveries).toEqual([states]);
  });

  it("reports a discovery declared wrong and skips it", () => {
    writeEngine({
      States: { folder: "src/states", file: "state.ts", suffix: "State" },
      generated: { folder: "src/generated", file: "state.ts", suffix: "State" },
      escape: { folder: "src/../../other", file: "state.ts", suffix: "State" },
      typed: { folder: "src/states", file: "state.ts", suffix: "state", satisfies: { type: 1 } },
    });
    const { discoveries, problems } = readFolderDiscoveries(loadContext(root));
    expect(discoveries).toEqual([]);
    const messages = problems.map((problem) => problem.message).join("\n");
    expect(messages).toContain("halonic.discover.States: the name must be lowercase");
    expect(messages).toContain('halonic.discover.generated: "folder" must be');
    expect(messages).toContain('halonic.discover.escape: "folder" must be');
    expect(messages).toContain('halonic.discover.typed: "suffix" must be');
    expect(messages).toContain('halonic.discover.typed: "type" must be');
  });

  it("reports a discover field that isn't an object", () => {
    writeEngine(["src/states"]);
    const { discoveries, problems } = readFolderDiscoveries(loadContext(root));
    expect(discoveries).toEqual([]);
    expect(problems.map((problem) => problem.file)).toEqual([`${engine}/package.json`]);
  });

  it("finds nothing in a package that declares nothing", () => {
    writeEngine(undefined);
    expect(readFolderDiscoveries(loadContext(root))).toEqual({ discoveries: [], problems: [] });
  });
});
