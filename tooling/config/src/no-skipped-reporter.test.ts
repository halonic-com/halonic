import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TestModule } from "vitest/node";
import { NoSkippedTestsReporter, skippedTestNames } from "./no-skipped-reporter.ts";

/** A test file as the run reports it at the end, with each test's name and state. */
function testFile(
  moduleId: string,
  tests: Record<string, string>,
  todos: ReadonlyArray<string> = [],
): TestModule {
  const children = {
    *allTests() {
      for (const [fullName, state] of Object.entries(tests)) {
        yield {
          fullName,
          name: fullName.split(" > ").pop(),
          options: { mode: todos.includes(fullName) ? "todo" : "run" },
          result: () => ({ state }),
        };
      }
    },
  };
  return { moduleId, children } as unknown as TestModule;
}

// The reporter sets process.exitCode, which would fail this run if it stayed set.
let exitCode: typeof process.exitCode;
beforeEach(() => {
  exitCode = process.exitCode;
});
afterEach(() => {
  process.exitCode = exitCode;
});

describe("skippedTestNames", () => {
  it("names the skipped tests of every file, with the file they are in", () => {
    const modules = [
      testFile("/pkg/src/a.test.ts", { runs: "passed", later: "skipped" }),
      testFile("/pkg/src/b.test.ts", { "group > off": "skipped", fails: "failed" }),
    ];
    expect(skippedTestNames(modules)).toEqual([
      "/pkg/src/a.test.ts: later",
      "/pkg/src/b.test.ts: group > off",
    ]);
  });
});

describe("NoSkippedTestsReporter", () => {
  it("leaves the run alone when every test ran", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    process.exitCode = undefined;
    new NoSkippedTestsReporter().onTestRunEnd([
      testFile("/pkg/src/a.test.ts", { runs: "passed", fails: "failed" }),
    ]);
    expect(error).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it("fails the run and names each skipped or todo test", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    new NoSkippedTestsReporter().onTestRunEnd([
      testFile("/pkg/src/a.test.ts", { later: "skipped", runs: "passed" }),
      testFile("/pkg/src/b.test.ts", { off: "skipped" }),
    ]);
    expect(process.exitCode).toBe(1);
    expect(error).toHaveBeenCalledOnce();
    expect(error.mock.calls[0]?.[0]).toBe(
      "2 test(s) were skipped or are todo. Run them or delete them:\n" +
        "  - /pkg/src/a.test.ts: later\n" +
        "  - /pkg/src/b.test.ts: off",
    );
  });

  describe("platform skips", () => {
    function run(tests: Record<string, string>, todos: ReadonlyArray<string> = []) {
      vi.restoreAllMocks();
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      process.exitCode = undefined;
      new NoSkippedTestsReporter().onTestRunEnd([testFile("/pkg/src/a.test.ts", tests, todos)]);
      return { log, error };
    }

    it("accepts a skip named [platform:<os>] with a reason, and prints it", () => {
      const { log, error } = run({
        "host > [platform:darwin] bwrap is Linux-only": "skipped",
      });
      expect(process.exitCode).toBeUndefined();
      expect(error).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledOnce();
      expect(log.mock.calls[0]?.[0]).toBe(
        "1 test(s) were skipped for the platform:\n" +
          "  - /pkg/src/a.test.ts: host > [platform:darwin] bwrap is Linux-only",
      );
    });

    it("fails a platform prefix without a reason", () => {
      for (const name of ["[platform:darwin]", "[platform:darwin] ", "[platform:darwin]  "]) {
        const { error } = run({ [name]: "skipped" });
        expect(process.exitCode).toBe(1);
        expect(error).toHaveBeenCalledOnce();
      }
    });

    it("fails a platform prefix with an unknown os", () => {
      const { log, error } = run({ "[platform:beos] no such thing": "skipped" });
      expect(process.exitCode).toBe(1);
      expect(error).toHaveBeenCalledOnce();
      expect(log).not.toHaveBeenCalled();
    });

    it("fails a todo named like a platform skip", () => {
      const name = "[platform:linux] later";
      const { log, error } = run({ [name]: "skipped" }, [name]);
      expect(process.exitCode).toBe(1);
      expect(error.mock.calls[0]?.[0]).toBe(
        "1 test(s) were skipped or are todo. Run them or delete them:\n" +
          "  - /pkg/src/a.test.ts: [platform:linux] later",
      );
      expect(log).not.toHaveBeenCalled();
    });

    it("fails a plain skip, and still lists the platform skip next to it", () => {
      const { log, error } = run({
        later: "skipped",
        "[platform:linux] needs Windows": "skipped",
      });
      expect(process.exitCode).toBe(1);
      expect(error.mock.calls[0]?.[0]).toBe(
        "1 test(s) were skipped or are todo. Run them or delete them:\n  - /pkg/src/a.test.ts: later",
      );
      expect(log).toHaveBeenCalledOnce();
    });
  });
});
