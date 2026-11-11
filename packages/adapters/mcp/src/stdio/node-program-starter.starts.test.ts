import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, delimiter, dirname, join } from "node:path";
import { skillScriptsRefusal } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readLines } from "./lines.ts";
import { nodeProgramStarter } from "./node-program-starter.ts";
import type { ProgramLaunch } from "./program.ts";
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
  return { program: process.execPath, args: ["-e", script], env, checkedEnv: {}, cwd: folder };
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
        "an option joined with =",
        (base: string) => ({
          ...node(""),
          args: [`--file=${join(base, "skills/acme/scripts/run.js")}`],
        }),
      ],
      [
        "a relative option joined with =",
        () => ({ ...node(""), args: ["--file=skills/acme/scripts/run.js"] }),
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

    it("refuses an option joined with = whose value links into a skill's scripts/ folder", async () => {
      await mkdir(join(folder, "skills/acme/scripts"), { recursive: true });
      await symlink(join(folder, "skills/acme/scripts"), join(folder, "innocent"));
      const launch = { ...node(""), args: ["--file=innocent"] };
      await expect(nodeProgramStarter.start(launch)).rejects.toThrow(skillScriptsRefusal);
    });

    it("refuses a value the connector file writes that names a skill's scripts/ folder", async () => {
      const authored = { NODE_OPTIONS: `--require ${join(folder, "skills/acme/scripts/run.js")}` };
      const launch = { ...node("", authored), checkedEnv: authored };
      await expect(nodeProgramStarter.start(launch)).rejects.toThrow(skillScriptsRefusal);
    });

    it.each([
      ["an inherited PATH entry", "PATH"],
      ["a secret value", "ACME_TOKEN"],
    ])(
      "starts with %s under a skill's scripts/ folder, as only checkedEnv is read",
      async (_, name) => {
        const scripts = join(folder, "skills/acme/scripts");
        const env = { [name]: [scripts, dirname(process.execPath)].join(delimiter) };
        const program = await nodeProgramStarter.start(node("process.exit(0)", env));
        expect(await stopProgram(program, 5000)).toEqual({ code: 0, signal: null });
      },
    );
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

    it("finds a bare name in the absolute folders of the PATH it is given", async () => {
      const launch = {
        ...node("process.exit(0)", { PATH: dirname(process.execPath) }),
        program: basename(process.execPath),
      };
      const program = await nodeProgramStarter.start(launch);
      expect(await stopProgram(program, 5000)).toEqual({ code: 0, signal: null });
    });

    it("never starts a bare name from the folder it starts in, even with . on the PATH", async () => {
      // Before HAL-3976, Linux's own lookup started this through the `.` entry.
      await writeFile(join(folder, "acme-server"), "#!/bin/sh\n");
      await chmod(join(folder, "acme-server"), 0o755);
      const launch = {
        ...node(""),
        program: "acme-server",
        env: { PATH: ["", "."].join(delimiter) },
      };
      await expect(nodeProgramStarter.start(launch)).rejects.toThrow("was not found");
    });

    it("refuses a bare name found in a skill's scripts/ folder on the PATH", async () => {
      // Windows looks only for an .exe; the refusal comes before anything starts.
      const fileName = process.platform === "win32" ? "acme-server.exe" : "acme-server";
      const scripts = join(folder, "skills/acme/scripts");
      await mkdir(scripts, { recursive: true });
      await writeFile(join(scripts, fileName), "#!/bin/sh\n");
      await chmod(join(scripts, fileName), 0o755);
      const launch = { ...node(""), program: "acme-server", env: { PATH: scripts } };
      await expect(nodeProgramStarter.start(launch)).rejects.toThrow(skillScriptsRefusal);
    });

    it.skipIf(process.platform === "win32")(
      "[platform:win32] needs POSIX links, modes and signals: stops the programs it started too, even when they ignore SIGTERM",
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
