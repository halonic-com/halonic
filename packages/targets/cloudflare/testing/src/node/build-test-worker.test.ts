import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestWorker } from "./build-test-worker.ts";
import { WorkerdCaseError } from "./run-in-workerd.ts";
import { compatibilityDate, WorkerdRunner } from "./workerd-runner.ts";

const suitesFolder = fileURLToPath(new URL("../worker/suites/", import.meta.url));

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
      'import { expect, it } from "vitest";\nit("acme", () => expect([1]).toContain(1));\n',
    );
    await expect(buildTestWorker([file])).rejects.toThrow(
      /lacks what a suite uses[\s\S]*suite\.ts uses toContain/,
    );
  });

  it("checks a suite file inside src/worker/suites too", async () => {
    const file = path.join(suitesFolder, `unsupported-matcher-${process.pid}.ts`);
    await writeFile(
      file,
      'import { expect, it } from "vitest";\nit("acme", () => expect([1]).toMatchObject([1]));\n',
    );
    try {
      await expect(buildTestWorker([file])).rejects.toThrow(
        /lacks what a suite uses[\s\S]*unsupported-matcher-\d+\.ts uses toMatchObject/,
      );
    } finally {
      await rm(file, { force: true });
    }
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

  it("binds a Durable Object class a suite exports, with the suite and the object in one isolate", async () => {
    const file = await suiteFile(
      [
        'import { env } from "cloudflare:workers";',
        'import { describe, expect, it } from "vitest";',
        "// The object reads this on every call; the suite moves it. Coordination tests rely on that.",
        "export const shared = { now: 1000 };",
        "export class AcmeObject {",
        "  async fetch() { return new Response(String(shared.now)); }",
        "}",
        'describe("acme", () => {',
        '  it("reaches the object", async () => {',
        '    const stub = env.ACME.get(env.ACME.idFromName("one"));',
        '    expect(await (await stub.fetch("http://acme.invalid/")).text()).toBe("1000");',
        "    shared.now = 2000;",
        '    expect(await (await stub.fetch("http://acme.invalid/")).text()).toBe("2000");',
        "  });",
        "});",
      ].join("\n"),
    );
    const runner = await WorkerdRunner.start(await buildTestWorker([file]), {
      durableObjects: { ACME: "AcmeObject" },
    });
    try {
      expect(await runner.run("1")).toEqual({ status: "passed", assertions: 2 });
    } finally {
      await runner.stop();
    }
  });
});

describe("the compatibility date", () => {
  it("is not later than the bundled workerd's own date", async () => {
    // workerd is miniflare's dependency, so resolve it from there.
    const fromMiniflare = createRequire(import.meta.resolve("miniflare"));
    const workerdVersion = (
      JSON.parse(await readFile(fromMiniflare.resolve("workerd/package.json"), "utf8")) as {
        version: string;
      }
    ).version;
    // workerd's version is 1.YYYYMMDD.patch.
    const [, stamp = ""] = workerdVersion.split(".");
    const workerdDate = `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}`;
    expect(compatibilityDate <= workerdDate).toBe(true);
  });
});
