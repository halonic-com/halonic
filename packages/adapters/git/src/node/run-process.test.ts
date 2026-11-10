import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { runProcess } from "./run-process.ts";

/** Node itself, running `script`: a program every test machine has. */
function node(script: string, limits: { timeoutMs?: number; maxOutputBytes?: number } = {}) {
  return runProcess({
    program: process.execPath,
    args: ["-e", script],
    cwd: process.cwd(),
    env: {},
    timeoutMs: limits.timeoutMs ?? 30_000,
    maxOutputBytes: limits.maxOutputBytes ?? 1024 * 1024,
  });
}

verifies("git.hardened", () => {
  describe("running a program", () => {
    it("gives its exit code, its output as bytes and its error output as text", async () => {
      const result = await node(
        "process.stdout.write('out'); process.stderr.write('err'); process.exit(3)",
      );
      expect(result).toEqual({ code: 3, stdout: Buffer.from("out"), stderr: "err" });
    });

    it("passes each argument as it is, with no shell to read it", async () => {
      const result = await runProcess({
        program: process.execPath,
        args: [
          "-e",
          "process.stdout.write(JSON.stringify(process.argv.slice(1)))",
          "$HOME",
          "a b;c",
          "*",
        ],
        cwd: process.cwd(),
        env: {},
        timeoutMs: 30_000,
        maxOutputBytes: 1024,
      });
      expect(JSON.parse(result.stdout.toString())).toEqual(["$HOME", "a b;c", "*"]);
    });

    it("gives it only the environment it is given", async () => {
      const result = await runProcess({
        program: process.execPath,
        args: [
          "-e",
          "process.stdout.write(JSON.stringify(Object.keys(process.env).filter((name) => name.startsWith('ACME'))))",
        ],
        cwd: process.cwd(),
        env: { ACME_ONLY: "1" },
        timeoutMs: 30_000,
        maxOutputBytes: 1024,
      });
      expect(JSON.parse(result.stdout.toString())).toEqual(["ACME_ONLY"]);
    });

    it("stops it, and rejects, past its time limit", async () => {
      await expect(node("setTimeout(() => {}, 60_000)", { timeoutMs: 100 })).rejects.toThrow(
        "took longer than 100 ms",
      );
    });

    it("stops it, and rejects, past its output limit", async () => {
      await expect(
        node("process.stdout.write('x'.repeat(4096)); setTimeout(() => {}, 60_000)", {
          maxOutputBytes: 1024,
        }),
      ).rejects.toThrow("more than 1024 bytes");
    });

    it("rejects when the program can't start", async () => {
      await expect(
        runProcess({
          program: "/acme/missing/git",
          args: [],
          cwd: process.cwd(),
          env: {},
          timeoutMs: 1000,
          maxOutputBytes: 1024,
        }),
      ).rejects.toThrow("Couldn't start /acme/missing/git");
    });
  });
});
