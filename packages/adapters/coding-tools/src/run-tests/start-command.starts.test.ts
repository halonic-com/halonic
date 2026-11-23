import { access, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { skillScriptsRefusal } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { removeTestFolders, type TestFolders, testFolders } from "../folders.test-helper.ts";
import { nodeCommand } from "./node-command.test-helper.ts";
import { type CommandStart, runCommand } from "./start-command.ts";

afterEach(removeTestFolders);

/** Runs `command` in fresh folders; the log file's text comes with the end. */
async function run(command: string, options: Partial<CommandStart> = {}, given?: TestFolders) {
  const folders = given ?? (await testFolders());
  const logFile = join(folders.testLogFolder, "run.log");
  const end = await runCommand({
    command,
    cwd: folders.workingFolder,
    env: { PATH: process.env["PATH"] ?? "" },
    logFile,
    maxLogBytes: 1024 * 1024,
    timeoutMs: 30_000,
    signal: new AbortController().signal,
    ...options,
  });
  return { end, log: await readFile(logFile, "utf8"), folders };
}

/** Whether a process with this id still runs. */
function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

verifies("coding-tools.run-tests", () => {
  describe("what runs", () => {
    it("refuses a command that names a skill's scripts/ file, before anything starts", async () => {
      const folders = await testFolders();
      const marker = join(folders.outside, "script-ran");
      await folders.write(
        "skills/acme/scripts/run.js",
        `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "ran");\n`,
      );
      const start = run(`"${process.execPath}" skills/acme/scripts/run.js`, {}, folders);
      await expect(start).rejects.toThrow(skillScriptsRefusal);
      await expect(access(marker)).rejects.toThrow();
      await expect(access(join(folders.testLogFolder, "run.log"))).rejects.toThrow();
    });

    it("writes standard output and error to the log, and gives the exit code", async () => {
      const { end, log } = await run(
        nodeCommand("console.log('out'); console.error('err'); process.exit(3)"),
      );
      expect(end).toEqual({ exitCode: 3, stoppedBecause: null, logCut: false });
      expect(log.split(/\r?\n/).filter(Boolean).sort()).toEqual(["err", "out"]);
    });

    it("gives the command only its environment, and no input", async () => {
      const script =
        "console.log('token=' + process.env.HALONIC_RUN_TOKEN); process.stdin.on('end', () => console.log('input ended')); process.stdin.resume()";
      const { end, log } = await run(nodeCommand(script));
      expect(end.exitCode).toBe(0);
      expect(log).toContain("token=undefined");
      expect(log).toContain("input ended");
    });

    it("cuts the log at its size and says so", async () => {
      const { end, log } = await run(nodeCommand("process.stdout.write('x'.repeat(100000))"), {
        maxLogBytes: 1_000,
      });
      expect(end).toMatchObject({ exitCode: 0, logCut: true });
      expect(log).toBe("x".repeat(1_000));
    });
  });

  describe("stopping", () => {
    it("stops a command at its time limit", async () => {
      const started = Date.now();
      const { end } = await run(nodeCommand("setTimeout(() => {}, 60000)"), { timeoutMs: 500 });
      expect(end).toEqual({ exitCode: null, stoppedBecause: "timeout", logCut: false });
      expect(Date.now() - started).toBeLessThan(20_000);
    });

    it("stops a command when the call is cancelled", async () => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 300);
      const { end } = await run(nodeCommand("setTimeout(() => {}, 60000)"), {
        signal: controller.signal,
      });
      expect(end.stoppedBecause).toBe("cancelled");
    });

    // Windows has no process groups; there only a timeout or a cancel stops the tree, with taskkill.
    it.skipIf(process.platform === "win32")(
      "stops what the command left running once it exits",
      async () => {
        const script =
          "const child = require('node:child_process').spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'inherit' }); child.unref(); console.log('left ' + child.pid)";
        const started = Date.now();
        const { end, log } = await run(nodeCommand(script));
        expect(end.exitCode).toBe(0);
        const left = Number(/left (\d+)/.exec(log)?.[1]);
        await expect.poll(() => isRunning(left)).toBe(false);
        expect(Date.now() - started).toBeLessThan(20_000);
      },
    );
  });

  it("opens a new log file and never writes over one", async () => {
    const folders = await testFolders();
    await run(nodeCommand("console.log(1)"), {}, folders);
    await expect(run(nodeCommand("console.log(2)"), {}, folders)).rejects.toThrow();
    expect((await stat(join(folders.testLogFolder, "run.log"))).size).toBeGreaterThan(0);
  });
});
