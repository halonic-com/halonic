import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readLines } from "./lines.ts";
import { nodeProgramStarter } from "./node-program-starter.ts";
import type { ProgramLaunch } from "./program.ts";
import { skillScriptsRefusal } from "./skill-scripts.ts";
import { stopProgram } from "./stop-program.ts";

let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "adapter-mcp-"));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

/** Node running `script`, with only the environment given. */
function node(script: string, env: Record<string, string> = {}): ProgramLaunch {
  return { program: process.execPath, args: ["-e", script], env, cwd: folder };
}

/** Echoes each line back, with the one variable it may see, and ends when its input closes. */
const echo = `
process.stdin.setEncoding("utf8");
process.stdin.on("data", (text) => process.stdout.write(text.trim() + " " + (process.env.ACME_MODE ?? "-") + " " + (process.env.HOME ?? "-") + "\\n"));
process.stdin.on("end", () => process.exit(0));
`;

/** Starts a child that ignores its input closing and SIGTERM, prints its pid, and waits. */
const parentOfStubbornChild = `
const { spawn } = require("node:child_process");
const child = spawn(process.execPath, ["-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"], { stdio: "ignore" });
process.on("SIGTERM", () => {});
process.stdout.write(child.pid + "\\n");
setInterval(() => {}, 1000);
`;

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

verifies("mcp.program-starter", () => {
  describe("refusing a skill's scripts", () => {
    it.each([
      [
        "a program",
        (base: string) => ({ ...node(""), program: join(base, "skills/acme/scripts/run.js") }),
      ],
      [
        "an argument",
        (base: string) => ({ ...node(""), args: [join(base, "skills/acme/scripts/run.js")] }),
      ],
      [
        "the folder it starts in",
        (base: string) => ({ ...node(""), cwd: join(base, "skills/acme/scripts") }),
      ],
    ])("refuses %s under a skill's scripts/ folder before anything starts", async (_case, make) => {
      await expect(nodeProgramStarter.start(make(folder))).rejects.toThrow(skillScriptsRefusal);
    });

    it("refuses an argument that links into a skill's scripts/ folder", async () => {
      await mkdir(join(folder, "skills/acme/scripts"), { recursive: true });
      await writeFile(join(folder, "skills/acme/scripts/run.js"), "");
      await symlink(join(folder, "skills/acme/scripts"), join(folder, "innocent"));
      const launch = { ...node(""), args: [join(folder, "innocent", "run.js")] };
      await expect(nodeProgramStarter.start(launch)).rejects.toThrow(skillScriptsRefusal);
    });
  });

  describe("a started program", () => {
    it("talks over its standard streams, sees only the environment given, and stops", async () => {
      const program = await nodeProgramStarter.start(node(echo, { ACME_MODE: "quiet" }));
      const lines = readLines(program.stdout, 1024);
      await program.write("hello\n");
      expect((await lines.next()).value).toBe("hello quiet -");
      expect(await stopProgram(program, 5000)).toEqual({ code: 0, signal: null });
    });

    it("refuses a program that doesn't exist", async () => {
      const missing = { ...node(""), program: join(folder, "no-such-program") };
      await expect(nodeProgramStarter.start(missing)).rejects.toThrow();
    });

    it.skipIf(process.platform === "win32")(
      "stops the programs it started too, even when they ignore SIGTERM",
      async () => {
        const program = await nodeProgramStarter.start(node(parentOfStubbornChild));
        const pid = Number((await readLines(program.stdout, 64).next()).value);
        expect(isRunning(pid)).toBe(true);
        await stopProgram(program, 200);
        await expect.poll(() => isRunning(pid)).toBe(false);
      },
    );
  });
});
