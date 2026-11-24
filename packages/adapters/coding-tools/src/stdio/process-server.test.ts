import { Readable } from "node:stream";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { removeTestFolders, testFolders } from "../folders.test-helper.ts";
import { serveCodingToolsOnProcess } from "./process-server.ts";

afterEach(removeTestFolders);

/** A process whose input is `lines`, as bytes like a real standard input, and what it wrote. */
function fakeProcess(cwd: string, lines: readonly unknown[]) {
  const out: string[] = [];
  const err: string[] = [];
  return {
    own: {
      stdin: Readable.from(lines.map((line) => Buffer.from(`${JSON.stringify(line)}\n`))),
      stdout: { write: (text: string) => out.push(text) },
      stderr: { write: (text: string) => err.push(text) },
      env: {},
      cwd: () => cwd,
    },
    out,
    err,
  };
}

verifies("coding-tools.stdio", () => {
  describe("serveCodingToolsOnProcess", () => {
    it("answers on standard output and ends with 0 when its input ends", async () => {
      const folders = await testFolders();
      const { own, out, err } = fakeProcess(folders.workingFolder, [
        { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25" } },
      ]);

      const code = await serveCodingToolsOnProcess(
        ["--temp-folder", folders.outside, "--tools", "read-only"],
        [],
        own,
      );

      expect(err).toEqual([]);
      expect(code).toBe(0);
      expect(JSON.parse(out.join(""))).toMatchObject({ id: 1, result: {} });
    });

    it("writes nothing on standard output and ends with 1 when it can't start", async () => {
      const folders = await testFolders();
      const { own, out, err } = fakeProcess(folders.workingFolder, []);

      const code = await serveCodingToolsOnProcess(["--temp-folder", folders.outside], [], own);

      expect(code).toBe(1);
      expect(out).toEqual([]);
      expect(err.join("")).toMatch(/The coding tools server stopped: .*--tools/);
    });
  });
});
