import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";

// Every program the forgetting of kept grants starts goes through this fake,
// so the test sees each one and nothing really runs.
const started = vi.hoisted(() => [] as { file: string; args: string[] }[]);
vi.mock("node:child_process", () => ({
  execFile: (
    file: string,
    args: string[],
    _options: unknown,
    done: (error: null, stdout: string, stderr: string) => void,
  ) => {
    started.push({ file, args });
    done(null, "", "");
  },
}));
vi.mock("@anthropic-ai/sandbox-runtime", () => ({
  VENDORED_SRT_WIN_EXE: "vendor/srt-win.exe",
  resolveSrtWin: ({ path }: { path: string }) => ({ exe: path, prependArgs: ["--srt-win"] }),
}));

const { KeptGrants } = await import("./kept-grants.ts");

verifies("sandbox-srt.kept-grants", () => {
  describe("what forgetting kept grants starts", () => {
    it("is only srt-win.exe from srt's vendored folder, with fixed arguments, never a skill's scripts (HAL-5884)", async () => {
      const grants = new KeptGrants();
      expect(await grants.forget(["work", "temp"])).toEqual({ heldByOthers: [], failed: [] });
      expect(started).toEqual([
        {
          file: "vendor/srt-win.exe",
          args: ["--srt-win", "acl", "forget", "work"],
        },
        {
          file: "vendor/srt-win.exe",
          args: ["--srt-win", "acl", "forget", "temp"],
        },
      ]);
    });
  });
});
