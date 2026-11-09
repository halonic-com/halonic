import { describe, expect, it } from "vitest";
import type { TestModuleState } from "vitest/node";
import { testFilesThatNeverRan } from "./unrun-files-reporter.ts";

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
