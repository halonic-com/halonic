import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { SandboxProfile, SandboxSession } from "@halonicjs/ports";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SrtSandbox } from "../src/srt-sandbox.ts";

/**
 * The fence with the session's folders inside the user profile, where the
 * host keeps them (`%LOCALAPPDATA%\halonic\tmp\<run id>`), set up as in
 * production: srt's install without the profile grant (HAL-5885). The other
 * Windows fence test works in RUNNER_TEMP, outside the profile, so it can't
 * show whether the sandbox account can reach a folder whose parents it may
 * not list. Run by the `sandbox-windows` CI job.
 */
const sandbox = new SrtSandbox();

async function read(stream: ReadableStream<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let text = "";
  for await (const chunk of stream) text += decoder.decode(chunk, { stream: true });
  return text + decoder.decode();
}

/** A run id as the host makes one (`run_<time in base 36>_<4 random bytes in hex>`), so the path has its real length. */
function runId(): string {
  return `run_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
}

describe("SrtSandbox on Windows, with the session's folders in the user profile", () => {
  let base: string;
  let work: string;
  let temp: string;
  let session: SandboxSession;

  const profile = (): SandboxProfile => ({
    workingFolder: work,
    tempFolder: temp,
    settingsFolder: null,
    readOnlyPaths: [],
    deniedPaths: [],
    env: {},
    network: { bridge: null, allowedSites: [] },
    timeLimitMs: 120_000,
  });

  beforeAll(async () => {
    const localAppData = process.env["LOCALAPPDATA"];
    if (localAppData === undefined) throw new Error("LOCALAPPDATA is not set");
    await mkdir(join(localAppData, "halonic"), { recursive: true });
    base = await mkdtemp(join(localAppData, "halonic", "fence-"));
    work = join(base, "work");
    temp = join(base, "tmp", runId());
    await mkdir(work, { recursive: true });
    session = await sandbox.open(profile());
  });

  afterAll(async () => {
    await session?.close();
    await rm(base, { recursive: true, force: true });
  });

  it("proves the fence", () => {
    expect(session.fence).toEqual({ state: "fenced" });
  });

  it("starts Node from the working folder, which resolves its script and writes both folders", async () => {
    const script = join(work, "profile-probe.cjs");
    await writeFile(
      script,
      `const fs = require("node:fs");
const path = require("node:path");
const result = {};
const attempt = (name, run) => { try { run(); result[name] = "ok"; } catch (error) { result[name] = error.code ?? String(error); } };
attempt("realpath", () => fs.realpathSync(__filename));
attempt("work", () => fs.writeFileSync(path.join(${JSON.stringify(work)}, "made.txt"), "x"));
attempt("temp", () => fs.writeFileSync(path.join(${JSON.stringify(temp)}, "made.txt"), "x"));
console.log(JSON.stringify(result));
`,
    );
    const started = await session.start({ program: process.execPath, args: [script] });
    const [out, errors, exit] = await Promise.all([
      read(started.stdout),
      read(started.stderr),
      started.exited,
    ]);
    // Node that can't start here prints its error and nothing else: show it.
    const why = `exit code ${exit.code}; errors: ${errors}`;
    const result = out.trim().split(/\r?\n/).pop() ?? "";
    expect(result, why).toBe(JSON.stringify({ realpath: "ok", work: "ok", temp: "ok" }));
    expect(await readFile(join(temp, "made.txt"), "utf8")).toBe("x");
  });
});
