import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TestModule } from "vitest/node";
import { NoSkippedTestsReporter, skippedTestNames } from "./no-skipped-reporter.ts";

/** A test file as the run reports it at the end, with each test's name and state. */
function testFile(moduleId: string, tests: Record<string, string>): TestModule {
  const children = {
    *allTests() {
      for (const [fullName, state] of Object.entries(tests)) {
        yield { fullName, result: () => ({ state }) };
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
});
