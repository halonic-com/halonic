import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SandboxProfile, SandboxSession } from "@halonicjs/ports";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { restrictToThisUser } from "../src/journal-acl.ts";
import { SrtSandbox } from "../src/srt-sandbox.ts";

/**
 * Halonic's data folder with a run's own folders in it (HAL-5644), on a real
 * Windows machine, the way `HarnessProfiles` builds it there: the data
 * folder's other entries are denied by name, and the data folder itself is
 * not. A deny on the data folder would take the right to look at the folders
 * on the way to the run's own, and Node, which looks at each of them to
 * resolve a script's path, could not start there: the first case proves the
 * fence probe, a Node script in the run's temp folder, starts.
 *
 * What is made later is kept out by the data folder's own access list, which
 * in the user profile names only the user. This test works outside the
 * profile (RUNNER_TEMP), so the folder another run makes later gets such an
 * access list of its own. srt sets its grants on the folders themselves, and
 * any sandboxed session may read a folder that has one, whatever its profile
 * denies: the last case shows this, and is expected to fail until srt keeps
 * sessions' reads apart (threat model 4.6, Known limits; HAL-5882).
 *
 * Run by the `sandbox-windows` CI job, like `srt-fence.windows.test.ts`;
 * the programs are Node scripts.
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

describe("SrtSandbox on Windows with the data folder's other entries denied by name", () => {
  let data: string;
  let session: SandboxSession;

  /** A path in the data folder. */
  const inData = (...parts: string[]) => join(data, ...parts);

  /** The profile of `run`, which works in its own folders and denies the host's folder and its `others` by name. */
  const profileOf = (run: string, others: readonly string[]): SandboxProfile => ({
    workingFolder: inData("runs", run, "files"),
    tempFolder: inData("tmp", run),
    settingsFolder: null,
    readOnlyPaths: [inData("runs", run, "agents")],
    deniedPaths: [
      inData("host"),
      ...others.flatMap((other) => [inData("runs", other), inData("tmp", other)]),
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

  /** Makes a run's folders; `closed` gives its run folder the access list it would get in the user profile. */
  async function makeRun(run: string, closed = false): Promise<void> {
    await mkdir(inData("runs", run), { recursive: true });
    if (closed) await restrictToThisUser(inData("runs", run));
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
    // Made after the session opened, as in the user profile.
    await makeRun("run_3", true);
  });

  afterAll(async () => {
    await session?.close();
    if (data !== undefined) await rm(join(data, ".."), { recursive: true, force: true });
  });

  it("proves the fence, with its probe in the run's temp folder", () => {
    expect(session.fence).toEqual({ state: "fenced" });
  });

  it("denies the rest of the data folder, also a run folder made after the session opened", async () => {
    const result = await runScript(
      session,
      "read.cjs",
      readingScript({
        host: inData("host", "secret.txt"),
        before: inData("runs", "run_2", "agents", "brief.md"),
        after: inData("runs", "run_3", "agents", "brief.md"),
        own: inData("runs", "run_1", "agents", "brief.md"),
      }),
    );
    expect(result).toEqual({ host: "denied", before: "denied", after: "denied", own: "read" });
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

  // Fails on purpose: srt runs every sandboxed program under one account and
  // grants run_1's working folder on the folder itself, which wins over the
  // deny run_2's profile names, so run_2 reads it while run_1 is running.
  // Decided in HAL-5882 to land as a known limit until srt keeps sessions'
  // reads apart (the read-separation request tracked on HAL-5644); when it
  // does, this case passes, `it.fails` fails, and it turns back into `it`.
  it.fails("denies a later session the folder a running one wrote, which srt has granted", async () => {
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
