import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { SandboxProfile, SandboxSession } from "@halonicjs/ports";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { removeFolder } from "../src/remove-folder.ts";
import { SrtSandbox } from "../src/srt-sandbox.ts";

/**
 * What a deny covers when files change after the session opened (design
 * HAL-3779 section 3.2, requirement `sandbox-srt.windows-folder-deny`). srt
 * sets the denies when the session opens, so this creates files only after
 * that: one in a denied folder, and one that replaces a denied file the way
 * a tool saves a file (write a new one, rename it over the old). Both lie in
 * a folder the session may read, so a refusal comes from the deny alone. Run
 * by the `sandbox-windows` CI job.
 */
const sandbox = new SrtSandbox();

async function read(stream: ReadableStream<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let text = "";
  for await (const chunk of stream) text += decoder.decode(chunk, { stream: true });
  return text + decoder.decode();
}

describe("SrtSandbox on Windows, with denied paths changed after the session opened", () => {
  let base: string;
  let work: string;
  let temp: string;
  let shared: string;
  let session: SandboxSession;

  const profile = (): SandboxProfile => ({
    workingFolder: work,
    tempFolder: temp,
    settingsFolder: null,
    readOnlyPaths: [shared],
    deniedPaths: [join(shared, "keys"), join(shared, "token.txt")],
    env: {},
    network: { bridge: null, allowedSites: [] },
    timeLimitMs: 120_000,
  });

  beforeAll(async () => {
    const localAppData = process.env["LOCALAPPDATA"];
    if (localAppData === undefined) throw new Error("LOCALAPPDATA is not set");
    await mkdir(join(localAppData, "halonic"), { recursive: true });
    base = await mkdtemp(join(localAppData, "halonic", "deny-later-"));
    work = join(base, "work");
    temp = join(base, "tmp");
    shared = join(base, "shared");
    await mkdir(work, { recursive: true });
    await mkdir(join(shared, "keys"), { recursive: true });
    await writeFile(join(shared, "keys", "early.txt"), "early");
    await writeFile(join(shared, "token.txt"), "old token");
    await writeFile(join(shared, "open.txt"), "open");
    session = await sandbox.open(profile());
    await writeFile(join(shared, "keys", "late.txt"), "late");
    await writeFile(join(shared, "token.txt.new"), "new token");
    await rm(join(shared, "token.txt"));
    await rename(join(shared, "token.txt.new"), join(shared, "token.txt"));
  });

  afterAll(async () => {
    await session?.close();
    await removeFolder(base);
  });

  it("denies a file made in a denied folder after the session opened, and records a replaced denied file", async () => {
    const script = join(work, "deny-probe.cjs");
    await writeFile(
      script,
      `const fs = require("node:fs");
const path = require("node:path");
const shared = ${JSON.stringify(shared)};
const result = {};
const attempt = (name, run) => { try { run(); result[name] = "ok"; } catch (error) { result[name] = error.code ?? String(error); } };
attempt("open", () => fs.readFileSync(path.join(shared, "open.txt")));
attempt("early", () => fs.readFileSync(path.join(shared, "keys", "early.txt")));
attempt("late", () => fs.readFileSync(path.join(shared, "keys", "late.txt")));
attempt("replaced", () => fs.readFileSync(path.join(shared, "token.txt")));
console.log(JSON.stringify(result));
`,
    );
    const started = await session.start({ program: process.execPath, args: [script] });
    const [out, errors, exit] = await Promise.all([
      read(started.stdout),
      read(started.stderr),
      started.exited,
    ]);
    const why = `exit code ${exit.code}; errors: ${errors}`;
    const result = JSON.parse(out.trim().split(/\r?\n/).pop() ?? "{}") as Record<string, string>;
    // The record for the design: a replaced denied file is the snapshot limit.
    console.log(`denied-later: ${JSON.stringify(result)}`);
    expect(result["open"], why).toBe("ok");
    expect(result["early"], why).not.toBe("ok");
    expect(result["late"], why).not.toBe("ok");
    expect(result["replaced"], why).toBeDefined();
  });
});
