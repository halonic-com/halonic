// `halonic run` stopped while its model call never answers (HAL-6677, the
// walk on HAL-6673): for Ctrl C and a closed terminal alike, the command still
// ends with the stop's code, and the workspace's engine lock is free for the
// next run.

import { appendFile, cp, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FileTrustStore } from "@halonicjs/adapter-fs-node";
import type { HttpClient } from "@halonicjs/ports";
import type { ProfileEnvironment } from "@halonicjs/profile";
import { fixedClock } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { engineLockFile } from "../../local-engine-host.ts";
import type { StopSignal } from "../../output/stop.ts";
import { runCli } from "../../run-cli.ts";
import { captureIo } from "../../test/capture-io.ts";
import { fakeSignals } from "../../test/fake-signals.ts";
import { engineStart, testRunSetup } from "../../test/run-setup.ts";
import { openWorkspaceDir } from "../../workspace-dir.ts";
import { nodeProfileEnvironment } from "../../workspace-runs.ts";
import { cliTrustService, readWorkspaceTrust } from "../../workspace-trust.ts";
import { runCommandWith } from "./command.ts";

const acmeExample = fileURLToPath(new URL("../../../../../examples/acme", import.meta.url));
const samsEmail = ["--input", "examples/refund-question.json"];
const noCommands = { path: undefined, endings: [] };

/** How long the stopped command waits for the close here, so the test doesn't wait 15 s. */
const closeLimitMs = 200;

let folder: string;
let acme: string;
let profile: ProfileEnvironment;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-cli-run-hung-"));
  acme = join(folder, "acme");
  await cp(acmeExample, acme, { recursive: true });
  profile = { ...nodeProfileEnvironment(), variables: { HALONIC_HOME: join(folder, "home") } };
  await sorterOnHungServer();
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

/**
 * Acme as on HAL-6673: Sorter, the agent of the step Classify it, on a
 * local OpenAI-compatible server, and Acme trusted as it is then.
 */
async function sorterOnHungServer(): Promise<void> {
  await writeFile(
    join(acme, "providers/hang.yaml"),
    "id: hang\nname: Hang\ntype: openai-compatible\nbaseUrl: http://127.0.0.1:18765/v1\nlocal: true\n",
  );
  await appendFile(join(acme, "models.yaml"), "  slow:\n    provider: hang\n    model: slow\n");
  await appendFile(join(acme, "hubs/support/agents/sorter.agent.yaml"), "model: slow\n");
  const dir = await openWorkspaceDir({ positionals: [], options: {} }, { cwd: acme });
  const { subject } = await readWorkspaceTrust(dir, noCommands);
  const trust = cliTrustService(new FileTrustStore(join(folder, "trust")), fixedClock(engineStart));
  const check = await trust.check(subject);
  expect((await trust.grant(subject, check.fingerprint, "cli")).ok).toBe(true);
}

/**
 * A server that takes each request and never answers, and doesn't stop
 * when the request is aborted either: only the backstop ends the command.
 * `called` resolves at the first request.
 */
function hungServer(): HttpClient & { called: Promise<void> } {
  let heard: () => void = () => {};
  const called = new Promise<void>((resolve) => {
    heard = resolve;
  });
  return {
    called,
    fetch: () => {
      heard();
      return new Promise<Response>(() => {});
    },
  };
}

/** The engine locks left in the profile, one per workspace whose engine is still open. */
async function engineLocks(): Promise<string[]> {
  const workspaces = join(folder, "home", "workspaces");
  const held: string[] = [];
  for (const workspace of await readdir(workspaces)) {
    const files = await readdir(join(workspaces, workspace));
    if (files.includes(engineLockFile)) held.push(workspace);
  }
  return held;
}

/** Runs `halonic run support-reply` on the hung server and sends `signal` once Sorter's model is called. */
async function stopOnHungModel(signal: StopSignal) {
  const server = hungServer();
  const signals = fakeSignals();
  const io = captureIo(acme);
  const command = runCommandWith({
    ...testRunSetup(folder, profile),
    http: server,
    stoppedCloseLimitMs: closeLimitMs,
  });
  const running = runCli(["run", "support-reply", ...samsEmail, "--debug"], io, [command], {
    stop: { signals, exitNow: () => {} },
  });
  await server.called;
  signals.send(signal);
  return { code: await running, io };
}

verifies("cli.local-engine-lock", () => {
  it.each([
    ["Ctrl C", "SIGINT", 130],
    ["a closed terminal", "SIGHUP", 129],
  ] as const)(
    "ends a run that %s stopped on a model that never answers, and frees the engine lock",
    async (_name, signal, exit) => {
      const { code, io } = await stopOnHungModel(signal);

      expect(code).toBe(exit);
      expect(io.stderr).toContain(
        "Stopped. The run 01jd8q was cancelled after the step Read the email. Nothing after it ran.",
      );
      expect(io.stderr.some((line) => line.includes("didn't close within 0.2 s"))).toBe(true);
      expect(await engineLocks()).toEqual([]);
    },
  );
});
