// Acceptance (HAL-5228, HAL-187 item 9): the old CLI's `studio test` and
// `studio run` calls on the base parity fixture, made again with `halonic`
// from the old fixed clock with counted IDs and the fixture trusted, exit as
// the old ones did and store the same runs, apart from the allowed
// differences and the known gaps. The compare, the rules and both lists live
// in testing-parity; this file only feeds it the CLI's results.
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileAgentPlacementStore } from "@halonicjs/adapter-fs-node";
import { MemoryTrustStore } from "@halonicjs/adapter-memory";
import { AgentPlacement, RunHistory } from "@halonicjs/app";
import { fixedClock } from "@halonicjs/std";
import {
  allowedDifferencesFile,
  type BaseCliCall,
  baseCliCalls,
  judgeCliCalls,
  knownGapsFile,
  type NewCliCall,
  pairCliCalls,
  readAllowedDifferences,
  readCliRecording,
  readKnownGaps,
} from "@halonicjs/testing-parity";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { runCommandWith } from "./commands/run/command.ts";
import { testCommandWith } from "./commands/test/command.ts";
import { runCli } from "./run-cli.ts";
import { captureIo } from "./test/capture-io.ts";
import { openWorkspaceDir } from "./workspace-dir.ts";
import { nodeProfileEnvironment, openWorkspaceRuns, webCryptoDigest } from "./workspace-runs.ts";
import { assertTrustable, cliTrustService, readWorkspaceTrust } from "./workspace-trust.ts";

/** The parity package's base fixture: a made-up workspace with every file kind. */
const base = join(import.meta.dirname, "..", "..", "..", "packages", "testing", "parity");
const golden = readCliRecording(join(base, "fixtures", "base"));
const start = Date.parse(golden.clock);
const noCommands = { path: undefined, endings: [] };

/** Trusts the workspace in `trustStore` as it is now, as `halonic trust` would. */
async function trust(workspace: string, trustStore: MemoryTrustStore): Promise<void> {
  const dir = await openWorkspaceDir({ positionals: [], options: {} }, { cwd: workspace });
  const read = await readWorkspaceTrust(dir, noCommands);
  const { subject } = read;
  const service = cliTrustService(trustStore, fixedClock(start));
  const check = await service.check(subject);
  assertTrustable(check, read);
  const granted = await service.grant(subject, check.fingerprint, "cli");
  if (!granted.ok) throw new Error(`The base couldn't be trusted: ${granted.error.kind}`);
}

/**
 * Makes one call on a fresh copy of the base, with a profile of its own, as
 * the old recorder gave each call a fresh copy: the clock stands at the old
 * fixed time, IDs count from 1, nothing goes online.
 */
async function callOnce(call: BaseCliCall): Promise<NewCliCall> {
  const folder = await mkdtemp(join(tmpdir(), "halonic-cli-parity-"));
  try {
    const workspace = join(folder, "acme");
    await cp(join(base, "fixtures", "base", "files"), workspace, { recursive: true });
    const profile = {
      ...nodeProfileEnvironment(),
      variables: { HALONIC_HOME: join(folder, "home") },
    };
    const trustStore = new MemoryTrustStore();
    await trust(workspace, trustStore);
    let counted = 0;
    const run = runCommandWith({
      clock: () => ({ now: new Date(start), timeZone: "UTC" }),
      trust: () => ({ trustStore, clock: fixedClock(start), commandSearch: noCommands }),
      http: { fetch: () => Promise.reject(new TypeError("The parity run doesn't go online.")) },
      profile,
      engine: { clock: fixedClock(start, 0), ids: { next: (prefix) => `${prefix}_${++counted}` } },
      sandboxGate: () => ({
        sandbox: { check: async () => ({ ok: true, reason: null, missing: [] }) },
        placement: new AgentPlacement({
          store: new FileAgentPlacementStore(join(folder, "placements")),
          digest: webCryptoDigest,
          clock: fixedClock(start),
        }),
      }),
    });
    const test = testCommandWith({ clock: { now: () => new Date(start) } });
    const io = captureIo(workspace);
    const exitCode = await runCli([...call.halonic, "--dir", workspace], io, [run, test]);
    const store = await openWorkspaceRuns(workspace, profile);
    const { runs } = await new RunHistory(store).listRuns();
    const stored = [];
    for (const { id } of runs) stored.push({ id, events: await store.events(id) });
    return {
      name: call.name,
      command: call.halonic[0] ?? "",
      exitCode,
      stdout: io.stdout.join("\n"),
      stderr: io.stderr.join("\n"),
      runs: stored,
    };
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

const fresh: NewCliCall[] = [];
for (const call of baseCliCalls) fresh.push(await callOnce(call));
const report = judgeCliCalls(
  pairCliCalls(golden, fresh),
  readAllowedDifferences(allowedDifferencesFile),
  readKnownGaps(knownGapsFile),
);

verifies("cli.parity-cli-calls", () => {
  it("makes every recorded call from the old CLI's fixed time", () => {
    expect(golden.clock).toBe("2026-01-01T00:00:00.000Z");
    expect(fresh.map((call) => call.name)).toEqual(golden.calls.map((call) => call.name));
  });

  it("has no difference that isn't allowed or a known gap, and no stale rule or gap", () => {
    expect(report.unexplained.map((result) => ({ call: result.call, ...result.ruled }))).toEqual(
      [],
    );
    expect(report.stale).toEqual([]);
  });

  it("exits with each call's own code before exit-codes-by-kind folds it", () => {
    // The rule turns 2 and 4 to 9 into the old 1, so a call that exits with
    // the wrong one of them would pass the compare; this pins them.
    expect(fresh.map((call) => [call.name, call.exitCode])).toEqual([
      ["test", 0],
      ["test one workflow", 0],
      ["test an unknown hub", 2],
      ["run and approve", 0],
      ["run and reject", 0],
      ["run that waits", 0],
      ["run with an event the state doesn't accept", 2],
      ["run an agent with the echo model", 1],
      ["run a foreach over a nested workflow", 1],
      ["run with a signed-out connector", 1],
      ["run an unknown workflow", 4],
      ["run with input that isn't JSON", 2],
      ["run without a workflow", 2],
    ]);
  });

  it("meets no trust refusal, since the base is trusted", () => {
    expect(fresh.filter((call) => call.exitCode === 3).map((call) => call.name)).toEqual([]);
  });

  it("still differs only by the known gaps, each with its task", () => {
    // The approval runs, the echo model's calls and every error are compared
    // strictly; the signed-out connector stays a gap until its task lands.
    const gaps = new Set(["run with a signed-out connector"]);
    expect(report.results.map((result) => [result.call, result.verdict])).toEqual(
      golden.calls.map((call) => [call.name, gaps.has(call.name) ? "gap" : "allowed"]),
    );
  });

  it("matches the old CLI on the echo model's calls, instructions and model calls included", () => {
    // HAL-4754 sends the agent's instructions and skills, and HAL-5206 logs
    // the run's own model calls, so these calls compare strictly: every
    // llm.request and llm.response, with its messages, usage and cost.
    const echoCalls = ["run an agent with the echo model", "run a foreach over a nested workflow"];
    const named = report.results.filter((result) => echoCalls.includes(result.call));
    expect(named.map((result) => [result.call, result.verdict, result.gaps ?? []])).toEqual(
      echoCalls.map((call) => [call, "allowed", []]),
    );
    for (const result of named) {
      expect(result.ruled.old, result.call).toEqual(result.ruled.new);
    }
  });

  it.each(report.results)("judges $call", (result) => {
    expect(result.verdict).not.toBe("different");
  });
});
