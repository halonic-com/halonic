import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TestModule, TestModuleState, TestSpecification } from "vitest/node";
import { testFilesThatNeverRan, UnrunTestFilesReporter } from "./unrun-files-reporter.ts";

/** A test file as the run reports it at the end, in the given state. */
function finishedFile(moduleId: string, state: TestModuleState) {
  return { moduleId, state: () => state };
}

describe("testFilesThatNeverRan", () => {
  const planned = ["/pkg/src/a.test.ts", "/pkg/src/b.test.tsx", "/pkg/src/c.test.ts"];

  it("lists nothing when every planned file ran", () => {
    const finished = [
      finishedFile("/pkg/src/c.test.ts", "passed"),
      finishedFile("/pkg/src/a.test.ts", "passed"),
      finishedFile("/pkg/src/b.test.tsx", "passed"),
    ];
    expect(testFilesThatNeverRan(planned, finished)).toEqual([]);
  });

  it("lists a file the run never reported, as when its worker didn't start", () => {
    const finished = [
      finishedFile("/pkg/src/a.test.ts", "passed"),
      finishedFile("/pkg/src/c.test.ts", "passed"),
    ];
    expect(testFilesThatNeverRan(planned, finished)).toEqual(["/pkg/src/b.test.tsx"]);
  });

  it("lists a file that was still queued or pending when the run ended", () => {
    const finished = [
      finishedFile("/pkg/src/a.test.ts", "queued"),
      finishedFile("/pkg/src/b.test.tsx", "pending"),
      finishedFile("/pkg/src/c.test.ts", "passed"),
    ];
    expect(testFilesThatNeverRan(planned, finished)).toEqual([
      "/pkg/src/a.test.ts",
      "/pkg/src/b.test.tsx",
    ]);
  });

  it("leaves out files that ran and failed or were skipped, which Vitest reports itself", () => {
    const finished = [
      finishedFile("/pkg/src/a.test.ts", "failed"),
      finishedFile("/pkg/src/b.test.tsx", "skipped"),
      finishedFile("/pkg/src/c.test.ts", "passed"),
    ];
    expect(testFilesThatNeverRan(planned, finished)).toEqual([]);
  });
});

describe("UnrunTestFilesReporter", () => {
  const root = process.cwd();
  const planned = [join(root, "src", "a.test.ts"), join(root, "src", "b.test.ts")];
  const specifications = planned.map((moduleId) => ({ moduleId })) as TestSpecification[];
  const ran = (moduleId: string) => finishedFile(moduleId, "passed") as unknown as TestModule;

  // The reporter sets process.exitCode, which would fail this run if it stayed set.
  let exitCode: typeof process.exitCode;
  beforeEach(() => {
    exitCode = process.exitCode;
  });
  afterEach(() => {
    process.exitCode = exitCode;
  });

  it("leaves the run alone when every planned file ran", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    process.exitCode = undefined;
    const reporter = new UnrunTestFilesReporter();
    reporter.onTestRunStart(specifications);
    reporter.onTestRunEnd(planned.map(ran));
    expect(error).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it("fails the run and names each file that never ran, relative to the package", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const reporter = new UnrunTestFilesReporter();
    reporter.onTestRunStart(specifications);
    reporter.onTestRunEnd([ran(planned[0] ?? "")]);
    expect(process.exitCode).toBe(1);
    expect(error).toHaveBeenCalledOnce();
    const message = String(error.mock.calls[0]?.[0]);
    expect(message).toMatch(/^1 of 2 test file\(s\) never ran/);
    expect(message).toContain("Run the tests again when the machine is less busy");
    expect(message).toContain("pnpm install --store-dir <a folder on a local disk>");
    expect(message.endsWith(`\n  - ${join("src", "b.test.ts")}`)).toBe(true);
  });
});
