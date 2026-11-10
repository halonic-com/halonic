import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { runProcess, windowsTreeStop } from "./run-process.ts";

// Ported from the desktop's git-guard, `limited_run_tests.rs`:
// `git_process_returns_the_full_output_within_the_limits`,
// `git_process_stops_git_at_the_deadline`,
// `git_process_fails_over_the_output_limit` and
// `git_process_stops_every_program_git_started_at_the_deadline`.

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

/**
 * Whether the process `pid` still runs. On Linux a stopped one can stay a
 * zombie until it is reaped, which `kill(pid, 0)` can't tell from a running
 * one, so it reads /proc there. Windows has no zombies.
 */
async function stillRunning(pid: number): Promise<boolean> {
  if (process.platform === "win32") return signalReaches(pid);
  try {
    const stat = await readFile(`/proc/${pid}/stat`, "utf8");
    // The state follows the program name, which is in parentheses.
    const state = stat.slice(stat.lastIndexOf(")") + 2, stat.lastIndexOf(")") + 3);
    return state !== "Z" && state !== "X";
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function signalReaches(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw error;
  }
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

    // Linux and Windows: macOS has neither /proc nor a way to tell a zombie
    // from a running program without starting `ps`.
    it.runIf(process.platform === "linux" || process.platform === "win32")(
      "[platform:darwin] can't tell a zombie from a running program: stops every program it started, too, past its time limit",
      async () => {
        const folder = await mkdtemp(join(tmpdir(), "halonic-adapter-git-"));
        try {
          const pidFile = join(folder, "pid");
          const startsAnother = [
            "const { spawn } = require('node:child_process');",
            "const fs = require('node:fs');",
            "const other = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60_000)'], { stdio: 'ignore' });",
            `fs.writeFileSync(${JSON.stringify(pidFile)}, String(other.pid));`,
            "setTimeout(() => {}, 60_000);",
          ].join("\n");
          await expect(node(startsAnother, { timeoutMs: 1000 })).rejects.toThrow(
            "took longer than 1000 ms",
          );
          const pid = Number(await readFile(pidFile, "utf8"));
          // The whole group gets SIGKILL at once, but the kernel takes each
          // program down in its own time: on a busy runner the other one can
          // still be ending when the first has closed (HAL-3828).
          await expect.poll(() => stillRunning(pid), { timeout: 5000 }).toBe(false);
        } finally {
          await rm(folder, { recursive: true, force: true });
        }
      },
    );

    it("stops it, and rejects, past its output limit", async () => {
      await expect(
        node("process.stdout.write('x'.repeat(4096)); setTimeout(() => {}, 60_000)", {
          maxOutputBytes: 1024,
        }),
      ).rejects.toThrow("more than 1024 bytes");
    });

    it("on Windows stops the tree with taskkill, by its full path", () => {
      const windowsFolder = "D:\\Windows"; // leak-guard: allow absolute-path an invented Windows folder
      expect(windowsTreeStop(4242, windowsFolder)).toEqual({
        program: `${windowsFolder}\\System32\\taskkill.exe`,
        args: ["/PID", "4242", "/T", "/F"],
      });
      const fallback = windowsTreeStop(4242, undefined).program;
      expect(fallback).toMatch(/^C:\\Windows\\/u); // leak-guard: allow absolute-path Windows' own install folder
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
