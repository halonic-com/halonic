import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { diskSettingsFolder } from "@halonicjs/adapter-harness-kit";
import { SrtSandbox } from "@halonicjs/adapter-sandbox-srt";
import type {
  HarnessBridge,
  HarnessEvent,
  HarnessTask,
  SandboxBlock,
  SandboxProfile,
  SandboxSession,
} from "@halonicjs/ports";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { testedVersions } from "../src/detect.ts";
import { opencodeEnvironment } from "../src/environment.ts";
import { opencodeFiles } from "../src/files.ts";
import { OpenCodeRun } from "../src/run.ts";
import { attemptsOut, readTrace, type TracedAttempt, tracedSession } from "./network-trace.ts";
import { type ScriptedBridge, scriptedAnswer, startScriptedBridge } from "./scripted-bridge.ts";

/**
 * The egress test (docs/adr/2026-11-24-opencode-harness-program.md, the
 * version-bump checklist): the pinned OpenCode, with the adapter's config
 * and environment, runs real tools in the real srt fence on Linux against a
 * scripted bridge, and sends nothing anywhere but the bridge.
 *
 * Every attempt is recorded in two places:
 * - srt's proxy, the fence's only way out, lets through only the bridge and
 *   reports every request it refuses, by the name asked for;
 * - strace, inside the fence, records every network call of OpenCode and
 *   all it starts, so a DNS question or a connection that skips the proxy
 *   is seen too.
 *
 * The negative control runs the same with `OPENCODE_DISABLE_MODELS_FETCH`
 * unset, and must show `models.opencode.ai`: a recorder that sees nothing
 * there would also see nothing in the real test. The tracer's control
 * shows a DNS question is recorded.
 *
 * Runs with `pnpm test:fence` in the Linux sandbox fence CI job, which
 * installs the pinned OpenCode and strace. It skips only on a computer
 * without them.
 */

const onLinux = process.platform === "linux";

/** Whether `program --version` runs here. */
function installed(program: string, versionWord: string): boolean {
  try {
    return execFileSync(program, ["--version"], { encoding: "utf8" }).includes(versionWord);
  } catch {
    return false;
  }
}
const pinnedVersion = testedVersions.at(-1) ?? "";
const ready =
  onLinux && installed("opencode", `v${pinnedVersion}`) && installed("strace", "strace");

const sandbox = new SrtSandbox();

const task: HarnessTask = {
  runId: "run-1",
  hubId: "acme",
  agentId: "writer",
  instructions: "Answer in one short sentence.",
  prompt: "What does hello.txt say?",
  model: "acme-model",
  asks: "in-sandbox",
};

/** What one run in the fence left behind. */
interface FencedRun {
  events: HarnessEvent[];
  error: Error | undefined;
  /** The requests srt's proxy refused. */
  refused: SandboxBlock[];
  /** Every network address in the trace, and the ones that could leave the fence. */
  traced: TracedAttempt[];
  out: TracedAttempt[];
  /** The run token the run had. */
  token: string;
}

let root: string;
let bridge: ScriptedBridge;
const sessions: SandboxSession[] = [];

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "oc-egress-"));
  await mkdir(join(root, "work"), { recursive: true });
  await writeFile(join(root, "work", "hello.txt"), "hello from acme\n");
  bridge = await startScriptedBridge(join(root, "work", "hello.txt"));
});

afterEach(async () => {
  await Promise.all(sessions.splice(0).map((session) => session.close()));
  await bridge.close();
  await rm(root, { recursive: true, force: true });
});

/** The profile the engine would give OpenCode, with `unset` taken out of its environment. */
function profileFor(harnessBridge: HarnessBridge, unset: readonly string[]): SandboxProfile {
  const profile: SandboxProfile = {
    workingFolder: join(root, "work"),
    tempFolder: join(root, "temp"),
    settingsFolder: join(root, "settings"),
    readOnlyPaths: [],
    deniedPaths: [],
    env: {},
    network: {
      bridge: { kind: "loopback", host: "127.0.0.1", port: bridge.port },
      allowedSites: [],
    },
    timeLimitMs: 120_000,
  };
  const env = opencodeEnvironment(harnessBridge, task, opencodeFiles(profile));
  for (const name of unset) delete env[name];
  return { ...profile, env };
}

/** Opens a fenced session for `profile` that records what srt refused and what strace saw. */
async function openRecorded(profile: SandboxProfile, traceFile: string) {
  const session = await sandbox.open(profile);
  sessions.push(session);
  const refused: SandboxBlock[] = [];
  session.onBlocked((block) => refused.push(block));
  return { session: tracedSession(session, traceFile), refused };
}

async function traceOf(file: string): Promise<TracedAttempt[]> {
  return readTrace(await readFile(file, "utf8"));
}

/** Runs OpenCode in the fence, with `unset` taken out of its environment. */
async function runOpenCode(unset: readonly string[] = []): Promise<FencedRun> {
  const harnessBridge: HarnessBridge = {
    url: bridge.url,
    token: `made-up-token-${crypto.randomUUID()}`,
  };
  const traceFile = join(root, "opencode.trace");
  const { session, refused } = await openRecorded(profileFor(harnessBridge, unset), traceFile);
  const run = new OpenCodeRun(task, session, harnessBridge, {
    settings: diskSettingsFolder,
    platform: process.platform,
  });
  const events: HarnessEvent[] = [];
  let error: Error | undefined;
  try {
    for await (const event of run) events.push(event);
  } catch (caught) {
    error = caught as Error;
  }
  const traced = await traceOf(traceFile);
  return { events, error, refused, traced, out: attemptsOut(traced), token: harnessBridge.token };
}

/** The files under `folder` that hold `text`, read byte for byte (OpenCode's database too). */
async function filesHolding(folder: string, text: string): Promise<string[]> {
  const entries = await readdir(folder, { recursive: true, withFileTypes: true });
  const holding: string[] = [];
  for (const entry of entries.filter((each) => each.isFile())) {
    const path = join(entry.parentPath, entry.name);
    if ((await readFile(path, "latin1")).includes(text)) holding.push(path);
  }
  return holding;
}

/** The hosts of the refused requests, each once. */
function refusedHosts(refused: readonly SandboxBlock[]): string[] {
  const hosts = refused.flatMap((block) => (block.kind === "network" ? [block.host] : []));
  return [...new Set(hosts)].sort();
}

// In CI a skip would pass without checking anything, so a missing program fails there.
it.runIf(process.env["CI"] === "true" && !ready)(
  `has Linux, opencode ${pinnedVersion} and strace in CI`,
  () => {
    expect({ onLinux, ready }).toEqual({ onLinux: true, ready: true });
  },
);

describe.skipIf(!ready)(
  `[needs Linux, opencode ${pinnedVersion} and strace] OpenCode's network in the srt fence`,
  () => {
    it("runs real tools against the bridge and sends nothing anywhere else", async () => {
      const result = await runOpenCode();
      process.stdout.write(`Bridge requests: ${JSON.stringify(bridge.requests)}\n`);

      expect(result.error).toBeUndefined();
      expect(result.events.filter((event) => event.type === "tool.called")).toHaveLength(2);
      expect(result.events.at(-1)).toEqual({
        type: "agent.finished",
        agent: "writer",
        output: scriptedAnswer,
      });
      const modelCalls = bridge.requests.filter((request) =>
        request.path.startsWith("/v1/messages"),
      );
      expect(modelCalls).toHaveLength(3);
      // The trace saw the run's traffic (srt's proxy and the private server are on the fence's loopback).
      expect(result.traced.length).toBeGreaterThan(0);
      expect({ refused: result.refused, out: result.out }).toEqual({ refused: [], out: [] });
      // The real program, its database and its log included, wrote the run token nowhere (HAL-18176).
      expect(await filesHolding(join(root, "settings"), result.token)).toEqual([]);
    });

    it("negative control: without OPENCODE_DISABLE_MODELS_FETCH, srt's proxy refuses models.opencode.ai", async () => {
      const result = await runOpenCode(["OPENCODE_DISABLE_MODELS_FETCH"]);

      expect(refusedHosts(result.refused)).toContain("models.opencode.ai");
    });

    it("tracer control: a DNS question in the fence is in the trace", async () => {
      const traceFile = join(root, "dns.trace");
      const harnessBridge: HarnessBridge = { url: bridge.url, token: "made-up-token" };
      const { session } = await openRecorded(profileFor(harnessBridge, []), traceFile);

      const lookup = await session.start({
        program: "getent",
        args: ["ahosts", "egress-check.example.com"],
      });
      await lookup.exited;

      const dns = attemptsOut(await traceOf(traceFile)).filter((attempt) => attempt.port === 53);
      expect(dns.length).toBeGreaterThan(0);
    });
  },
);
