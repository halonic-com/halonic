import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestWorker } from "./build-test-worker.ts";
import { WorkerdCaseError } from "./run-in-workerd.ts";
import { WorkerdRunner } from "./workerd-runner.ts";

describe("the test Worker", () => {
  let folder = "";

  beforeEach(async () => {
    folder = await mkdtemp(path.join(tmpdir(), "acme-test-worker-"));
  });

  afterEach(async () => {
    await rm(folder, { recursive: true, force: true });
  });

  async function suiteFile(source: string): Promise<string> {
    const file = path.join(folder, "suite.ts");
    await writeFile(file, source);
    return file;
  }

  it("doesn't build when a suite imports what the shim doesn't export", async () => {
    const file = await suiteFile(
      'import { vi as other, expectTypeOf } from "vitest";\nexpectTypeOf(other);\n',
    );
    await expect(buildTestWorker([file])).rejects.toThrow(
      /No matching export .* for import "expectTypeOf"/,
    );
  });

  it("doesn't build when a suite calls a matcher the shim doesn't have", async () => {
    const file = await suiteFile(
      'import { expect, it } from "vitest";\nit("acme", () => expect([1]).toMatchObject([1]));\n',
    );
    await expect(buildTestWorker([file])).rejects.toThrow(
      /lacks what a suite uses[\s\S]*suite\.ts uses toMatchObject/,
    );
  });

  it("runs a failing case inside workerd and brings back its message and stack", async () => {
    const file = await suiteFile(
      [
        'import { describe, expect, it } from "vitest";',
        'describe("acme", () => {',
        '  it("knows where it runs", () => expect(navigator.userAgent).toBe("Cloudflare-Workers"));',
        '  it("fails", () => expect(1).toBe(2));',
        "});",
      ].join("\n"),
    );
    const runner = await WorkerdRunner.start(await buildTestWorker([file]));
    try {
      const tree = await runner.cases();
      const [suite] = tree.children;
      expect(suite?.kind === "suite" ? suite.children.map((node) => node.name) : []).toEqual([
        "knows where it runs",
        "fails",
      ]);
      expect(await runner.run("1")).toEqual({ status: "passed", assertions: 1 });
      const failed = await runner.run("2");
      expect(failed).toMatchObject({
        status: "failed",
        assertions: 1,
        message: "AssertionError: expected 1 to be 2",
      });
      expect(new WorkerdCaseError(failed).stack).toContain("(inside workerd)");
      await expect(runner.run("3")).rejects.toThrow("answered POST /run with 500");
    } finally {
      await runner.stop();
    }
  });
});
