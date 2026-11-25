import { spawn } from "node:child_process";
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Writable } from "node:stream";
import type {
  SandboxCommand,
  SandboxProcess,
  SandboxProfile,
  SandboxSession,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { sessionReadLimitBytes, sessionSettingsFolder } from "./session-settings-folder.ts";

let root: string;
let settingsFolder: string;
let tempFolder: string;
let workingFolder: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "session-settings-"));
  settingsFolder = join(root, "home", ".claude");
  tempFolder = join(root, "tmp");
  workingFolder = join(root, "work");
  await mkdir(workingFolder, { recursive: true });
  await mkdir(tempFolder, { recursive: true });
});

afterEach(async () => {
  await chmod(join(root, "home"), 0o755).catch(() => undefined);
  await rm(root, { recursive: true, force: true });
});

/** A session that runs each program on this computer, as a container's `exec` would, recording what it started. */
function localSession(): SandboxSession & { started: SandboxCommand[] } {
  const started: SandboxCommand[] = [];
  const profile = { settingsFolder, tempFolder, workingFolder } as SandboxProfile;
  return {
    profile,
    started,
    fence: { state: "fenced" },
    onBlocked: () => () => undefined,
    close: async () => undefined,
    async start(command): Promise<SandboxProcess> {
      started.push(command);
      const child = spawn(command.program, command.args, { cwd: command.cwd ?? workingFolder });
      const exited = new Promise<{ code: number | null; signal: string | null }>((resolve) =>
        child.on("close", (code, signal) => resolve({ code, signal })),
      );
      return {
        stdin: Writable.toWeb(child.stdin) as WritableStream<Uint8Array>,
        stdout: Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>,
        stderr: Readable.toWeb(child.stderr) as ReadableStream<Uint8Array>,
        exited: exited.then((exit) => ({ ...exit, reason: "exited" as const })),
        kill: async () => {
          child.kill("SIGKILL");
          await exited;
        },
      };
    },
  };
}

verifies("harness-kit.session-settings-folder", () => {
  it("writes a file through the session and reads it back, leaving nothing aside", async () => {
    const session = localSession();
    const writer = sessionSettingsFolder(session);
    const path = join(settingsFolder, "settings.json");
    const text = '{ "say": "$(rm -rf /) `x` \\"quoted\\"" }\n';

    await writer.write(path, text);

    expect(await writer.read(path)).toBe(text);
    expect(await readFile(path, "utf8")).toBe(text);
    expect(await readdir(settingsFolder)).toEqual(["settings.json"]);
    // The text went on standard input: no argument holds it.
    expect(session.started.flatMap((command) => command.args).join("\n")).not.toContain(
      "rm -rf /)",
    );
  });

  it("gives null for a missing file, and says whether a path exists", async () => {
    const writer = sessionSettingsFolder(localSession());

    expect(await writer.read(join(tempFolder, "absent.md"))).toBeNull();
    expect(await writer.exists(join(tempFolder, "absent.md"))).toBe(false);
    expect(await writer.exists(tempFolder)).toBe(true);
  });

  it("lists every name in a folder, hidden ones too, and none for a missing folder", async () => {
    await mkdir(settingsFolder, { recursive: true });
    await writeFile(join(settingsFolder, ".credentials.json"), "{}");
    await writeFile(join(settingsFolder, "old.md"), "old");
    await writeFile(join(settingsFolder, "line\nbreak"), "odd");
    const writer = sessionSettingsFolder(localSession());

    expect((await writer.list(settingsFolder)).sort()).toEqual(
      [".credentials.json", "line\nbreak", "old.md"].sort(),
    );
    expect(await writer.list(join(settingsFolder, "none"))).toEqual([]);
  });

  it("removes a folder inside the settings folder with everything in it", async () => {
    await mkdir(join(settingsFolder, "projects", "deep"), { recursive: true });
    const writer = sessionSettingsFolder(localSession());

    await writer.remove(join(settingsFolder, "projects"));

    expect(await readdir(settingsFolder)).toEqual([]);
  });

  it("refuses a path outside its two folders, or with a .. part, before anything starts", async () => {
    await writeFile(join(workingFolder, "notes.md"), "keep");
    const session = localSession();
    const writer = sessionSettingsFolder(session);

    await expect(writer.remove(join(workingFolder, "notes.md"))).rejects.toThrow(/refuses/);
    await expect(writer.remove(`${settingsFolder}/../../work`)).rejects.toThrow(/refuses/);
    await expect(writer.remove("/")).rejects.toThrow(/refuses/);
    await expect(writer.write("settings.json", "{}")).rejects.toThrow(/refuses/);
    await expect(writer.write(`${settingsFolder}-other/settings.json`, "{}")).rejects.toThrow(
      /refuses/,
    );
    await expect(writer.remove(settingsFolder)).rejects.toThrow(/refuses/);

    expect(session.started).toEqual([]);
    expect(await readFile(join(workingFolder, "notes.md"), "utf8")).toBe("keep");
  });

  it("fails a write it can't make, leaving no temporary file", async () => {
    await mkdir(settingsFolder, { recursive: true });
    await chmod(join(root, "home"), 0o555);
    await chmod(settingsFolder, 0o555);
    const writer = sessionSettingsFolder(localSession());

    await expect(writer.write(join(settingsFolder, "settings.json"), "{}")).rejects.toThrow(
      /write .* failed with exit code/,
    );
    await chmod(settingsFolder, 0o755);
    expect(await readdir(settingsFolder)).toEqual([]);
  });

  it("refuses to read a file over the limit", async () => {
    await writeFile(join(tempFolder, "big.txt"), "x".repeat(sessionReadLimitBytes + 1));
    const writer = sessionSettingsFolder(localSession());

    await expect(writer.read(join(tempFolder, "big.txt"))).rejects.toThrow(/over/);
  });
});
