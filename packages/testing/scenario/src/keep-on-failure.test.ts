import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from "vitest";
import { keepOnFailure, pathSegment } from "./keep-on-failure.ts";

// The failing tests below are real failures, marked `it.fails` so the run
// stays green. Their files are checked in each describe's afterAll, which
// runs after all of its tests whatever order they ran in.

let directory = "";

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "keep-on-failure-"));
});

afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});

const thisFile = pathSegment("src/keep-on-failure.test.ts");

/**
 * What a failed test looked like after keepOnFailure ran: its errors and its
 * tags. Vitest clears the errors of an `it.fails` test once it counts as
 * passed, so they are copied here first. Call it before keepOnFailure:
 * Vitest runs onTestFailed hooks last-registered first (`sequence.hooks`
 * is "stack"), so this one sees what keepOnFailure's hook left.
 */
const failed = new Map<string, { errors: string[]; kept: string[] | undefined }>();

function rememberAfterFailure(): void {
  onTestFailed(({ task }) => {
    failed.set(task.name, {
      errors: (task.result?.errors ?? []).map((error) => error.message),
      kept: task.meta.keptOnFailure,
    });
  });
}

async function readKept(...segments: string[]): Promise<unknown> {
  return JSON.parse(await readFile(join(directory, thisFile, ...segments), "utf8"));
}

verifies("scenario.keep-on-failure", () => {
  describe("a failing test", () => {
    it.fails("keeps what collect returned", () => {
      rememberAfterFailure();
      const store = { records: [{ id: "acme-1", size: 10n, tags: new Set(["a"]) }] };
      keepOnFailure("records", () => store, { directory });
      expect(store.records).toHaveLength(0);
    });

    it.fails("../../escape / me", () => {
      keepOnFailure("records", async () => ["kept"], { directory });
      expect("escaped").toBe("kept inside");
    });

    it.fails("keeps its own error when collect throws", () => {
      rememberAfterFailure();
      keepOnFailure(
        "records",
        () => {
          throw new Error("store closed");
        },
        { directory },
      );
      expect("the own failure").toBe("something else");
    });

    afterAll(async () => {
      const kept = await readKept(
        "scenario.keep-on-failure-a-failing-test-keeps-what-collect-returned",
        "records.json",
      );
      expect(kept).toEqual({ state: { records: [{ id: "acme-1", size: "10", tags: ["a"] }] } });
      expect(failed.get("keeps what collect returned")?.kept).toEqual([
        expect.stringMatching(/keeps-what-collect-returned[\\/]records\.json$/),
      ]);

      expect(await readdir(join(directory, thisFile))).toContain(
        "scenario.keep-on-failure-a-failing-test-escape-me",
      );

      const keptError = await readKept(
        "scenario.keep-on-failure-a-failing-test-keeps-its-own-error-when-collect-throws",
        "records.json",
      );
      expect(keptError).toMatchObject({
        collectFailed: { name: "Error", message: "store closed" },
      });
      expect(failed.get("keeps its own error when collect throws")?.errors).toEqual([
        "expected 'the own failure' to be 'something else' // Object.is equality",
      ]);
    });
  });

  describe("a passing test", () => {
    const passingDirectory = () => join(directory, "passing");

    it("writes nothing", () => {
      keepOnFailure("records", () => ["never kept"], { directory: passingDirectory() });
      expect(1 + 1).toBe(2);
    });

    afterAll(async () => {
      await expect(readdir(passingDirectory())).rejects.toMatchObject({ code: "ENOENT" });
    });
  });

  describe("a bad name", () => {
    it.each(["Records", "../records", "records.json", "", "timer records"])(
      "rejects %j",
      (name) => {
        expect(() => keepOnFailure(name, () => null, { directory })).toThrow(
          "Use lowercase words joined by dashes",
        );
      },
    );
  });

  describe("a path segment", () => {
    it.each([
      ["..", "unnamed"],
      ["a/../../b", "a-b"],
      ["acme\\runs\\x", "acme-runs-x"],
      [".hidden", "hidden"],
      ["suite > test name", "suite-test-name"],
    ])("turns %j into %j", (text, segment) => {
      expect(pathSegment(text)).toBe(segment);
    });

    it("is at most 120 characters", () => {
      expect(pathSegment("x".repeat(500))).toHaveLength(120);
    });
  });
});
