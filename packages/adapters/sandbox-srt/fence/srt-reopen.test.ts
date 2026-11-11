import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SandboxProfile, SandboxSession } from "@halonicjs/ports";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SrtSandbox } from "../src/srt-sandbox.ts";

/**
 * Halonic's data folder denied as a whole, with one run's own folders
 * reopened in it (HAL-5644), against the real fence on Linux (bubblewrap) and
 * macOS (Seatbelt). What another run makes in the data folder after the
 * session opens must be denied as well, with no list to keep up to date.
 * Windows denies the data folder's entries by name instead; its case is in
 * `srt-reopen.windows.test.ts`.
 */
const sandbox = new SrtSandbox();

async function read(stream: ReadableStream<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let text = "";
  for await (const chunk of stream) text += decoder.decode(chunk, { stream: true });
  return text + decoder.decode();
}

async function isThere(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

describe("SrtSandbox with Halonic's data folder denied and a run's folders reopened", () => {
  let data: string;
  let session: SandboxSession;

  /** A path in the data folder. */
  const inData = (...parts: string[]) => join(data, ...parts);

  const profile = (): SandboxProfile => ({
    workingFolder: inData("runs", "run_1", "files", "writer"),
    tempFolder: inData("tmp", "run_1"),
    settingsFolder: null,
    readOnlyPaths: [],
    deniedPaths: [data],
    reopenedPaths: [
      inData("runs", "run_1", "agents"),
      inData("runs", "run_1", "files", "writer"),
      inData("tmp", "run_1"),
    ],
    env: { HOME: inData("tmp", "run_1") },
    network: { bridge: { host: "127.0.0.1", port: 4100 }, allowedSites: [] },
    timeLimitMs: 120_000,
  });

  /** Runs a shell command in the fence and gives its exit code and output. */
  async function run(command: string): Promise<{ code: number | null; out: string }> {
    const started = await session.start({ program: "sh", args: ["-c", command] });
    const [out, exit] = await Promise.all([read(started.stdout), started.exited]);
    return { code: exit.code, out };
  }

  beforeAll(async () => {
    // The system's own temp folder, deep on macOS: the launcher's socket goes to a short folder of its own (HAL-5885).
    const base = await realpath(await mkdtemp(join(tmpdir(), "srt-reopen-")));
    data = join(base, "data");
    for (const folder of [
      "host",
      "runs/run_2",
      "runs/run_1/agents",
      "runs/run_1/files/writer",
      "tmp/run_1",
    ]) {
      await mkdir(inData(...folder.split("/")), { recursive: true });
    }
    await writeFile(inData("host", "secret.txt"), "host secret");
    await writeFile(inData("runs", "run_2", "notes.txt"), "run 2 notes");
    await writeFile(inData("runs", "run_1", "agents", "brief.md"), "own brief");
    session = await sandbox.open(profile());
    // Made after the session opened: another run's folder, and a file at the data folder's root.
    await mkdir(inData("runs", "run_3"), { recursive: true });
    await writeFile(inData("runs", "run_3", "notes.txt"), "run 3 notes");
    await writeFile(inData("late.txt"), "late secret");
  });

  afterAll(async () => {
    await session?.close();
    if (data !== undefined) await rm(join(data, ".."), { recursive: true, force: true });
  });

  it("proves the fence", () => {
    expect(session.fence).toEqual({ state: "fenced" });
  });

  it.each([
    ["the host's files", ["host", "secret.txt"]],
    ["another run's folder that was there when the session opened", ["runs", "run_2", "notes.txt"]],
    ["another run's folder made after the session opened", ["runs", "run_3", "notes.txt"]],
    ["a file made at the data folder's root after the session opened", ["late.txt"]],
  ])("denies reading %s", async (_, parts) => {
    const { code, out } = await run(`cat '${inData(...parts)}'`);
    expect(out).toBe("");
    expect(code).not.toBe(0);
  });

  it("reads the run's own reopened entry", async () => {
    const { code, out } = await run(`cat '${inData("runs", "run_1", "agents", "brief.md")}'`);
    expect(out).toBe("own brief");
    expect(code).toBe(0);
  });

  it("writes the run's working and temp folders, on the disk", async () => {
    const { code } = await run(
      `echo work > made.txt && echo temp > '${inData("tmp", "run_1", "made.txt")}'`,
    );
    expect(code).toBe(0);
    expect(await readFile(inData("runs", "run_1", "files", "writer", "made.txt"), "utf8")).toBe(
      "work\n",
    );
    expect(await readFile(inData("tmp", "run_1", "made.txt"), "utf8")).toBe("temp\n");
  });

  it("creates and renames nothing in the data folder itself", async () => {
    // On Linux the denied folder is an empty tmpfs, so a write may succeed in
    // there; what counts is that nothing reaches the disk.
    await run(
      `echo x > '${inData("planted.txt")}'; mv '${inData("host")}' '${inData("moved")}'; mv '${inData("runs", "run_2")}' '${inData("runs", "run_2x")}'`,
    );
    expect(await isThere(inData("planted.txt"))).toBe(false);
    expect(await isThere(inData("moved"))).toBe(false);
    expect(await isThere(inData("host", "secret.txt"))).toBe(true);
    expect(await isThere(inData("runs", "run_2", "notes.txt"))).toBe(true);
  });
});
