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

/** The folder of a test in this file, from the names of its describe blocks and its own. */
function testFolder(...names: string[]): string {
  return pathSegment(["scenario.keep-on-failure", ...names].join(" > "));
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
        testFolder("a failing test", "keeps what collect returned"),
        "records.json",
      );
      expect(kept).toEqual({ state: { records: [{ id: "acme-1", size: "10", tags: ["a"] }] } });
      expect(failed.get("keeps what collect returned")?.kept).toEqual([
        expect.stringMatching(/keeps-what-collect-returned-[0-9a-f]{8}[\\/]records\.json$/),
      ]);

      const escaped = testFolder("a failing test", "../../escape / me");
      expect(escaped).toMatch(/^scenario\.keep-on-failure-a-failing-test-escape-me-[0-9a-f]{8}$/);
      expect(await readdir(join(directory, thisFile))).toContain(escaped);

      const keptError = await readKept(
        testFolder("a failing test", "keeps its own error when collect throws"),
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

  describe("two long test names that share their first 120 characters", () => {
    const shared = "a restart must deliver every timer that was due while it was stopped ".repeat(
      2,
    );

    it.fails(`${shared}in order`, () => {
      keepOnFailure("records", () => "in order", { directory });
      expect("delivered").toBe("kept");
    });

    it.fails(`${shared}once`, () => {
      keepOnFailure("records", () => "once", { directory });
      expect("delivered").toBe("kept");
    });

    afterAll(async () => {
      const describeName = "two long test names that share their first 120 characters";
      const inOrder = testFolder(describeName, `${shared}in order`);
      const once = testFolder(describeName, `${shared}once`);
      expect(inOrder.slice(0, 111)).toBe(once.slice(0, 111));
      expect(inOrder).not.toBe(once);
      expect(await readKept(inOrder, "records.json")).toEqual({ state: "in order" });
      expect(await readKept(once, "records.json")).toEqual({ state: "once" });
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

  describe("a second keep with the same name", () => {
    it("throws, instead of overwriting the first", () => {
      keepOnFailure("records", () => "first", { directory });
      keepOnFailure("deliveries", () => "other", { directory });
      expect(() => keepOnFailure("records", () => "second", { directory })).toThrow(
        'this test already keeps "records"',
      );
    });

    it("is fine in another test", () => {
      expect(() => keepOnFailure("records", () => "first", { directory })).not.toThrow();
    });

    let attempts = 0;
    // The test's own `expect`, because a retry counts its assertions afresh.
    it("is fine in a retry of the same test", { retry: 1 }, ({ expect }) => {
      attempts += 1;
      keepOnFailure("records", () => attempts, { directory });
      expect(attempts).toBe(2);
    });
  });

  describe("a path segment", () => {
    it.each(["timer-records", "scenario.keep-on-failure", "x".repeat(120)])(
      "keeps the safe name %j as it is",
      (text) => {
        expect(pathSegment(text)).toBe(text);
      },
    );

    it.each([
      ["..", "unnamed"],
      ["", "unnamed"],
      ["a/../../b", "a-b"],
      ["acme\\runs\\x", "acme-runs-x"],
      [".hidden", "hidden"],
      ["suite > test name", "suite-test-name"],
    ])("turns %j into %j and a hash of the whole name", (text, readable) => {
      expect(pathSegment(text)).toMatch(new RegExp(`^${readable}-[0-9a-f]{8}$`));
    });

    it("gives names that turn into the same text different segments", () => {
      expect(pathSegment("a/b")).not.toBe(pathSegment("a b"));
    });

    it("is at most 120 characters, and ends in a hash when it cuts", () => {
      const segment = pathSegment("x".repeat(500));
      expect(segment).toHaveLength(120);
      expect(segment).toMatch(/^x{111}-[0-9a-f]{8}$/);
      expect(segment).not.toBe(pathSegment(`${"x".repeat(499)}y`));
    });
  });
});
