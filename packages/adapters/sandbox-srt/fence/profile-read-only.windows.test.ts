import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { SandboxProfile, SandboxSession } from "@halonicjs/ports";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { removeFolder } from "../src/remove-folder.ts";
import { SrtSandbox } from "../src/srt-sandbox.ts";

/**
 * The fence for a project inside the user profile (`%USERPROFILE%\…`, where
 * most projects live) with a read-only and a denied folder in it, and the
 * temp folder where the host keeps it (`%LOCALAPPDATA%\halonic\tmp\<run id>`).
 * A read-only or denied folder makes srt change the access on its parent
 * folders, and inside the profile that once cost the sandbox account its way
 * to the session's folders (HAL-10705); the other Windows fence tests work
 * outside the profile or without such folders. Run by the `sandbox-windows`
 * CI job (HAL-5398).
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

describe("SrtSandbox on Windows, with a project in the user profile that has read-only and denied folders", () => {
  let project: string;
  let tempBase: string;
  let work: string;
  let temp: string;
  let vendor: string;
  let secrets: string;
  let session: SandboxSession;

  const profile = (): SandboxProfile => ({
    workingFolder: work,
    tempFolder: temp,
    settingsFolder: null,
    readOnlyPaths: [vendor],
    deniedPaths: [secrets],
    env: {},
    network: { bridge: null, allowedSites: [] },
    timeLimitMs: 120_000,
  });

  beforeAll(async () => {
    const localAppData = process.env["LOCALAPPDATA"];
    if (localAppData === undefined) throw new Error("LOCALAPPDATA is not set");
    project = await mkdtemp(join(homedir(), "halonic-project-"));
    work = join(project, "work");
    vendor = join(work, "vendor");
    secrets = join(work, "secrets");
    await mkdir(vendor, { recursive: true });
    await mkdir(secrets, { recursive: true });
    await writeFile(join(vendor, "lib.txt"), "lib");
    await writeFile(join(secrets, "key.txt"), "key");
    await mkdir(join(localAppData, "halonic"), { recursive: true });
    tempBase = await mkdtemp(join(localAppData, "halonic", "fence-ro-"));
    temp = join(tempBase, "tmp", runId());
    session = await sandbox.open(profile());
  });

  afterAll(async () => {
    await session?.close();
    await removeFolder(project);
    await removeFolder(tempBase);
  });

  it("proves the fence", () => {
    expect(session.fence).toEqual({ state: "fenced" });
  });

  it("starts Node from the working folder, writes it and temp, reads the read-only folder and keeps the denied one shut", async () => {
    const script = join(work, "profile-ro-probe.cjs");
    await writeFile(
      script,
      `const fs = require("node:fs");
const path = require("node:path");
const result = {};
const attempt = (name, run) => { try { run(); result[name] = "ok"; } catch (error) { result[name] = error.code ?? String(error); } };
attempt("realpath", () => fs.realpathSync(__filename));
attempt("work", () => fs.writeFileSync(path.join(${JSON.stringify(work)}, "made.txt"), "x"));
attempt("temp", () => fs.writeFileSync(path.join(${JSON.stringify(temp)}, "made.txt"), "x"));
attempt("vendorRead", () => fs.readFileSync(path.join(${JSON.stringify(vendor)}, "lib.txt")));
attempt("vendorWrite", () => fs.writeFileSync(path.join(${JSON.stringify(vendor)}, "made.txt"), "x"));
attempt("secretsRead", () => fs.readFileSync(path.join(${JSON.stringify(secrets)}, "key.txt")));
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
    const last = out.trim().split(/\r?\n/).pop() ?? "";
    console.log(`profile-read-only: ${last || why}`);
    const result = JSON.parse(last || "{}") as Record<string, string>;
    expect(result["realpath"], why).toBe("ok");
    expect(result["work"], why).toBe("ok");
    expect(result["temp"], why).toBe("ok");
    expect(result["vendorRead"], why).toBe("ok");
    expect(result["vendorWrite"], why).not.toBe("ok");
    expect(result["secretsRead"], why).not.toBe("ok");
  });
});
