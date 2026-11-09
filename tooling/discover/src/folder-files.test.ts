import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { loadContext } from "@halonicjs/tooling-check";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type FolderDiscovery, generatedFolderFile } from "./folder-discovery.ts";
import {
  camelCase,
  discoveredFolders,
  folderProblems,
  renderFolderFile,
  writeFolderFiles,
} from "./folder-files.ts";

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

describe("camelCase", () => {
  it("joins hyphenated words", () => {
    expect(camelCase("task")).toBe("task");
    expect(camelCase("sub-workflow")).toBe("subWorkflow");
  });
});

describe("renderFolderFile", () => {
  it("imports every entry and keys it by folder name, checked against the type", () => {
    const text = renderFolderFile(states, ["final", "sub-workflow"]);
    expect(text).toContain('import type { StateRegistry } from "../kernel/registry.ts";');
    expect(text).toContain('import { finalState } from "../states/final/state.ts";');
    expect(text).toContain('import { subWorkflowState } from "../states/sub-workflow/state.ts";');
    expect(text).toContain("export const states = {\n  final: finalState,\n");
    expect(text).toContain(
      '  "sub-workflow": subWorkflowState,\n} as const satisfies StateRegistry;',
    );
  });

  it("leaves out the type check when none is declared", () => {
    const { satisfies: _unused, ...plain } = states;
    const text = renderFolderFile(plain, []);
    expect(text).not.toContain("import type");
    expect(text).toContain("export const states = {\n} as const;\n");
  });
});

describe("folder discovery in a repo", () => {
  let root: string;
  const write = (path: string, text: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  const addState = (name: string): void => {
    const exportName = `${camelCase(name)}State`;
    write(`${engine}/src/states/${name}/state.ts`, `export const ${exportName} = "${name}";\n`);
  };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "halonic-discover-folders-"));
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

  it("finds the entries and reports folders without the file", () => {
    addState("task");
    addState("final");
    write(`${engine}/src/states/notes/README.md`, "not a state\n");
    write(`${engine}/src/states/registry.ts`, "export {};\n");
    const context = loadContext(root);
    expect(discoveredFolders(context, states)).toEqual({
      entries: ["final", "task"],
      incomplete: ["notes"],
    });
    const problems = folderProblems(context, [states]);
    expect(problems.map((problem) => problem.file)).toEqual([`${engine}/src/states/notes`]);
    expect(problems[0]?.message).toContain("needs a state.ts");
  });

  it("reports a folder name that can't become a key", () => {
    addState("Task_Old");
    const problems = folderProblems(loadContext(root), [states]);
    expect(problems[0]?.message).toContain("lowercase words joined by hyphens");
  });

  it("writes the generated file once and again only when the folders change", () => {
    addState("task");
    expect(writeFolderFiles(loadContext(root), [states])).toEqual([generatedFolderFile(states)]);
    expect(writeFolderFiles(loadContext(root), [states])).toEqual([]);
    addState("final");
    expect(writeFolderFiles(loadContext(root), [states])).toEqual([generatedFolderFile(states)]);
    expect(readFileSync(join(root, generatedFolderFile(states)), "utf8")).toBe(
      renderFolderFile(states, ["final", "task"]),
    );
  });

  describe("typed against a union", () => {
    // TypeScript 7 has no compiler API, so the test runs its tsc as CI would.
    const tsc = join(
      dirname(createRequire(import.meta.url).resolve("typescript/package.json")),
      "bin",
      "tsc",
    );
    const typeErrors = (): string => {
      writeFolderFiles(loadContext(root), [states]);
      const compilerOptions = {
        strict: true,
        noEmit: true,
        allowImportingTsExtensions: true,
        module: "esnext",
        moduleResolution: "bundler",
        target: "es2022",
        types: [],
      };
      write(`${engine}/tsconfig.json`, JSON.stringify({ compilerOptions, include: ["src"] }));
      try {
        execFileSync(process.execPath, [tsc, "-p", join(root, engine)], { encoding: "utf8" });
        return "";
      } catch (error) {
        return String((error as { stdout?: unknown }).stdout);
      }
    };

    beforeEach(() => {
      write(
        `${engine}/src/kernel/registry.ts`,
        'export type StateRegistry = { readonly [Type in "task" | "final"]: Type };\n',
      );
      addState("task");
    });

    it("passes when the folders match the union", () => {
      addState("final");
      expect(typeErrors()).toBe("");
    });

    it("fails when a folder is missing", () => {
      expect(typeErrors()).toContain("final");
    });

    it("fails when there is an extra folder", () => {
      addState("final");
      addState("loop");
      expect(typeErrors()).toContain("loop");
    });
  });
});
