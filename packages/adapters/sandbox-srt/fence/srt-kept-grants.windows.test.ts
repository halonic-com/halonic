import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SandboxProfile, SandboxSession } from "@halonicjs/ports";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SrtSandbox } from "../src/srt-sandbox.ts";

/**
 * What a later session can read of an earlier one's folders, on a real
 * Windows machine (HAL-5884, from HAL-5882). srt keeps a write grant on a
 * session's working and temp folders after it ends, and that grant wins over
 * a deny inherited from a parent folder. The session now forgets it on close.
 * Run by the `sandbox-windows` CI job (`vitest.fence-windows.config.ts`),
 * outside the user profile like the other Windows fence tests.
 */
const sandbox = new SrtSandbox();

async function read(stream: ReadableStream<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let text = "";
  for await (const chunk of stream) text += decoder.decode(chunk, { stream: true });
  return text + decoder.decode();
}

describe("kept Windows grants between sessions", () => {
  let base: string;
  let runs: string;

  const profile = (run: string, deniedPaths: string[] = []): SandboxProfile => ({
    workingFolder: join(runs, run, "files"),
    tempFolder: join(runs, run, "temp"),
    settingsFolder: null,
    readOnlyPaths: [],
    deniedPaths,
    env: {},
    network: { bridge: null, allowedSites: [] },
    timeLimitMs: 120_000,
  });

  /** Runs a Node script from the session's working folder inside the fence and returns the last line it printed. */
  async function runScript(session: SandboxSession, name: string, source: string): Promise<string> {
    const script = join(session.profile.workingFolder, name);
    await writeFile(script, source);
    const started = await session.start({ program: process.execPath, args: [script] });
    const [out, errors] = await Promise.all([
      read(started.stdout),
      read(started.stderr),
      started.exited,
    ]);
    if (out.trim() === "") throw new Error(`${name} printed nothing; its errors: ${errors}`);
    return out.trim().split(/\r?\n/).pop() ?? "";
  }

  /** What the session sees of `file`: its text, or `hidden`. */
  function readFile(session: SandboxSession, file: string): Promise<string> {
    return runScript(
      session,
      "read.cjs",
      `try { console.log(require("node:fs").readFileSync(${JSON.stringify(file)}, "utf8")); } catch { console.log("hidden"); }`,
    );
  }

  /** Writes `made.txt` in the session's working folder from inside the fence. */
  async function writeMade(session: SandboxSession): Promise<string> {
    const made = join(session.profile.workingFolder, "made.txt");
    await runScript(
      session,
      "write.cjs",
      `require("node:fs").writeFileSync(${JSON.stringify(made)}, "from run_1"); console.log("written");`,
    );
    return made;
  }

  beforeAll(async () => {
    base = await mkdtemp(join(process.env["RUNNER_TEMP"] ?? tmpdir(), "srt-grants-"));
    runs = join(base, "runs");
    await mkdir(join(runs, "run_1", "files"), { recursive: true });
    await mkdir(join(runs, "run_2", "files"), { recursive: true });
  });

  afterAll(async () => {
    await rm(base, { recursive: true, force: true });
  });

  it("hides what session A wrote from session B, which denies A's run folder, once A has closed", async () => {
    const a = await sandbox.open(profile("run_1"));
    const made = await writeMade(a);
    await a.close();
    const b = await sandbox.open(profile("run_2", [join(runs, "run_1")]));
    try {
      expect(await readFile(b, made)).toBe("hidden");
    } finally {
      await b.close();
    }
  });

  // Known limit (a): srt does not separate reads between sessions that run at
  // the same time, so B reads A's live folder. This stays open until it does.
  it.fails("hides what session A wrote from session B while both are open", async () => {
    const a = await sandbox.open(profile("run_1"));
    const b = await sandbox.open(profile("run_2", [join(runs, "run_1")]));
    try {
      const made = await writeMade(a);
      expect(await readFile(b, made)).toBe("hidden");
    } finally {
      await b.close();
      await a.close();
    }
  });
});
