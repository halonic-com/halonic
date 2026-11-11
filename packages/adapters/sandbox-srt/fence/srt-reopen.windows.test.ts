import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SandboxProfile, SandboxSession } from "@halonicjs/ports";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SrtSandbox } from "../src/srt-sandbox.ts";

/**
 * Halonic's data folder denied as a whole, with one run's own folders
 * reopened in it (HAL-5644), on a real Windows machine. There the deny is an
 * inheriting DENY entry on the data folder, and a reopened folder gets an
 * ALLOW entry of its own, which ranks above the inherited DENY.
 *
 * srt keeps the write grant on each writable folder between sessions, and
 * any sandboxed session may read a folder that has one. So the profile also
 * denies the data folder's other entries by name, as `HarnessProfiles` does
 * on Windows, and the last case checks that this keeps an earlier session's
 * folder unreadable.
 *
 * Run by the `sandbox-windows` CI job, like `srt-fence.windows.test.ts`;
 * the programs are Node scripts, and it works outside the user profile.
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

describe("SrtSandbox on Windows with Halonic's data folder denied and a run's folders reopened", () => {
  let data: string;
  let session: SandboxSession;

  /** A path in the data folder. */
  const inData = (...parts: string[]) => join(data, ...parts);

  /** The profile of `run`, which works in its own folders and denies the data folder, and its `others` by name. */
  const profileOf = (run: string, others: readonly string[]): SandboxProfile => ({
    workingFolder: inData("runs", run, "files"),
    tempFolder: inData("tmp", run),
    settingsFolder: null,
    readOnlyPaths: [],
    deniedPaths: [data, ...others.map((other) => inData("runs", other)), inData("host")],
    reopenedPaths: [
      inData("runs", run, "agents"),
      inData("runs", run, "files"),
      inData("tmp", run),
    ],
    env: {},
    network: { bridge: { host: "127.0.0.1", port: 4100 }, allowedSites: [] },
    timeLimitMs: 120_000,
  });

  /** Runs a Node script from the session's working folder and gives what it printed, parsed. */
  async function runScript(
    inside: SandboxSession,
    name: string,
    source: string,
  ): Promise<Record<string, string>> {
    const script = join(inside.profile.workingFolder, name);
    await writeFile(script, source);
    const started = await inside.start({ program: process.execPath, args: [script] });
    const [out, errors] = await Promise.all([
      read(started.stdout),
      read(started.stderr),
      started.exited,
    ]);
    const last = out.trim().split(/\r?\n/).pop() ?? "";
    if (last === "") throw new Error(`${name} printed nothing; its errors: ${errors}`);
    return JSON.parse(last) as Record<string, string>;
  }

  /** A script that tries to read each path and prints `read` or `denied` for each. */
  const readingScript = (paths: Record<string, string>) => `const fs = require("node:fs");
const result = {};
for (const [name, path] of Object.entries(${JSON.stringify(paths)})) {
  try { fs.readFileSync(path); result[name] = "read"; } catch { result[name] = "denied"; }
}
console.log(JSON.stringify(result));`;

  async function makeRun(run: string): Promise<void> {
    for (const folder of [
      ["runs", run, "agents"],
      ["runs", run, "files"],
      ["tmp", run],
    ]) {
      await mkdir(inData(...folder), { recursive: true });
    }
    await writeFile(inData("runs", run, "agents", "brief.md"), `${run} brief`);
  }

  beforeAll(async () => {
    const base = await mkdtemp(join(process.env["RUNNER_TEMP"] ?? tmpdir(), "srt-win-reopen-"));
    data = join(base, "data");
    await mkdir(inData("host"), { recursive: true });
    await writeFile(inData("host", "secret.txt"), "host secret");
    await makeRun("run_1");
    await makeRun("run_2");
    session = await sandbox.open(profileOf("run_1", ["run_2"]));
    // Made after the session opened: another run's folder, and a file at the data folder's root.
    await makeRun("run_3");
    await writeFile(inData("late.txt"), "late secret");
  });

  afterAll(async () => {
    await session?.close();
    if (data !== undefined) await rm(join(data, ".."), { recursive: true, force: true });
  });

  it("proves the fence", () => {
    expect(session.fence).toEqual({ state: "fenced" });
  });

  it("denies the rest of the data folder, also what was made after the session opened", async () => {
    const result = await runScript(
      session,
      "read.cjs",
      readingScript({
        host: inData("host", "secret.txt"),
        before: inData("runs", "run_2", "agents", "brief.md"),
        after: inData("runs", "run_3", "agents", "brief.md"),
        late: inData("late.txt"),
        own: inData("runs", "run_1", "agents", "brief.md"),
      }),
    );
    expect(result).toEqual({
      host: "denied",
      before: "denied",
      after: "denied",
      late: "denied",
      own: "read",
    });
  });

  it("writes the run's working and temp folders, and creates and renames nothing in the data folder", async () => {
    const result = await runScript(
      session,
      "write.cjs",
      `const fs = require("node:fs");
const result = {};
const attempt = (name, act) => { try { act(); result[name] = "done"; } catch { result[name] = "refused"; } };
attempt("work", () => fs.writeFileSync(${JSON.stringify(inData("runs", "run_1", "files", "made.txt"))}, "work"));
attempt("temp", () => fs.writeFileSync(${JSON.stringify(inData("tmp", "run_1", "made.txt"))}, "temp"));
attempt("plant", () => fs.writeFileSync(${JSON.stringify(inData("planted.txt"))}, "x"));
attempt("rename", () => fs.renameSync(${JSON.stringify(inData("host"))}, ${JSON.stringify(inData("moved"))}));
console.log(JSON.stringify(result));`,
    );
    expect(result).toEqual({ work: "done", temp: "done", plant: "refused", rename: "refused" });
    expect(await readFile(inData("runs", "run_1", "files", "made.txt"), "utf8")).toBe("work");
    expect(await isThere(inData("planted.txt"))).toBe(false);
    expect(await isThere(inData("host", "secret.txt"))).toBe(true);
  });

  it("denies a later session the folder an earlier one wrote, which keeps srt's grant", async () => {
    // run_1's working folder now carries a kept write grant; run_2's session names it denied.
    const later = await sandbox.open(profileOf("run_2", ["run_1", "run_3"]));
    try {
      const result = await runScript(
        later,
        "read.cjs",
        readingScript({
          earlier: inData("runs", "run_1", "files", "made.txt"),
          own: inData("runs", "run_2", "agents", "brief.md"),
        }),
      );
      expect(result).toEqual({ earlier: "denied", own: "read" });
    } finally {
      await later.close();
    }
  });
});
