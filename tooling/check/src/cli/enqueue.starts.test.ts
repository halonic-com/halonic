import { afterAll, describe, expect, it, vi } from "vitest";

// Every program check:enqueue starts goes through this fake, so the test sees
// each start and nothing really runs.
const started = vi.hoisted(() => [] as { file: string; args: readonly string[] }[]);
vi.mock("node:child_process", () => ({
  spawnSync: (file: string, args: readonly string[]) => {
    started.push({ file, args });
    const output = args[0] === "branch" ? "feature\n" : "";
    return { status: 0, stdout: output, stderr: "" };
  },
}));
vi.mock("node:fs", () => ({ mkdtempSync: () => "/scratch", rmSync: () => undefined }));
vi.mock("../lib/workspace.ts", () => ({ findRepoRoot: () => "/repo" }));

afterAll(() => {
  vi.restoreAllMocks();
});

describe("what check:enqueue starts", () => {
  it("is only git, pnpm and Node on the repo's own tooling, never a skill's scripts (HAL-2983)", async () => {
    vi.spyOn(console, "log").mockReturnValue(undefined);
    await import("./enqueue.ts");
    expect(new Set(started.map((start) => start.file))).toEqual(new Set(["git", "pnpm", "node"]));
    const nodeStarts = started.filter((start) => start.file === "node");
    expect(nodeStarts.map((start) => start.args[0])).toEqual([
      "tooling/check/src/cli/requirement-guard.ts",
    ]);
    for (const start of started) {
      expect(start.args.join(" ")).not.toMatch(/(^|[\s/])scripts\//);
    }
    expect(process.exitCode).toBe(0);
    process.exitCode = undefined;
  });
});
