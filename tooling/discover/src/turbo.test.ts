import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CheckContext } from "@halonicjs/tooling-check";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FolderDiscovery } from "./folder-discovery.ts";
import {
  codegenTask,
  fixTurboInputs,
  requiredCodegenGlobs,
  turboFile,
  turboProblems,
} from "./turbo.ts";

const states: FolderDiscovery = {
  packageDirectory: "packages/core/acme-engine",
  name: "states",
  folder: "src/states",
  file: "state.ts",
  suffix: "State",
};

const featureTask = {
  inputs: ["packages/studio/features/*/src/feature.ts"],
  outputs: ["apps/studio/src/generated/**"],
};

describe("requiredCodegenGlobs", () => {
  it("names the manifest, the discovered files and the generated file", () => {
    expect(requiredCodegenGlobs([states])).toEqual({
      inputs: [
        "packages/core/acme-engine/package.json",
        "packages/core/acme-engine/src/states/*/state.ts",
      ],
      outputs: ["packages/core/acme-engine/src/generated/states.ts"],
    });
  });
});

describe("turboProblems and fixTurboInputs", () => {
  let root: string;
  // Only `root` is read, so a partial context keeps the test free of a git repo.
  const context = (): CheckContext => ({ root }) as CheckContext;
  const writeTurbo = (codegen: object): void => {
    const config = { tasks: { [codegenTask]: codegen, lint: { outputs: [] } } };
    writeFileSync(join(root, turboFile), `${JSON.stringify(config, null, 2)}\n`);
  };
  const readTurbo = (): { tasks: Record<string, { inputs?: string[]; outputs?: string[] }> } =>
    JSON.parse(readFileSync(join(root, turboFile), "utf8"));

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "halonic-discover-turbo-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("reports every missing glob", () => {
    writeTurbo(featureTask);
    const messages = turboProblems(context(), [states]).map((problem) => problem.message);
    expect(messages).toEqual([
      `"//#codegen" inputs is missing "packages/core/acme-engine/package.json". Run "pnpm discover --fix".`,
      `"//#codegen" inputs is missing "packages/core/acme-engine/src/states/*/state.ts". Run "pnpm discover --fix".`,
      `"//#codegen" outputs is missing "packages/core/acme-engine/src/generated/states.ts". Run "pnpm discover --fix".`,
    ]);
  });

  it("adds the missing globs after the existing ones and keeps the other tasks", () => {
    writeTurbo(featureTask);
    expect(fixTurboInputs(context(), [states])).toBe(true);
    const { tasks } = readTurbo();
    expect(Object.keys(tasks)).toEqual([codegenTask, "lint"]);
    expect(tasks[codegenTask]?.inputs?.[0]).toBe(featureTask.inputs[0]);
    expect(tasks[codegenTask]?.outputs?.[0]).toBe(featureTask.outputs[0]);
    expect(turboProblems(context(), [states])).toEqual([]);
    expect(fixTurboInputs(context(), [states])).toBe(false);
  });

  it("adds the codegen task's lists when they are missing", () => {
    writeTurbo({});
    expect(fixTurboInputs(context(), [states])).toBe(true);
    expect(readTurbo().tasks[codegenTask]).toEqual(requiredCodegenGlobs([states]));
  });

  it("does nothing without a turbo.json", () => {
    expect(turboProblems(context(), [states])).toEqual([]);
    expect(fixTurboInputs(context(), [states])).toBe(false);
  });
});
