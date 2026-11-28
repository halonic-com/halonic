// `halonic run` while `halonic serve` holds the workspace's engine hands the run to `serve`, so
// it shows in the phone's Inbox (HAL-19396); any other holder keeps the lock's refusal.

import { cp, mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import type { LocalEngine } from "@halonicjs/adapter-workspace-engine-node";
import { noKeyOrigins } from "@halonicjs/ports";
import { verifies, waitUntil } from "@halonicjs/testing-spec";
import { loadWorkspace } from "@halonicjs/workspace";
import { afterEach, beforeEach, expect, it } from "vitest";
import { type EngineHolder, openLocalEngine } from "../../cli-local-engine.ts";
import { exitCode } from "../../exit-code.ts";
import { runCli } from "../../run-cli.ts";
import { type AcmeRuns, acmeRunsSetup, removeAcmeRuns } from "../../test/acme-runs.ts";
import { captureIo } from "../../test/capture-io.ts";
import { fakeSignals } from "../../test/fake-signals.ts";
import { memoryConsole } from "../../test/memory-console.ts";
import { nodeProfileEnvironment } from "../../workspace-runs.ts";
import { serveCommandWith } from "../serve/command.ts";
import type { ConsoleTransport } from "../serve/serve-console.ts";
import { runCommandWith } from "./command.ts";

/** The Acme example, on the test model: Support reply waits for the reply's approval. */
const acmeExample = fileURLToPath(new URL("../../../../../examples/acme", import.meta.url));

/** A test that starts `halonic serve`: the first start opens it from cold imports. */
const slowTest = { timeout: 30_000 };

const samsEmail = ["--input", "examples/refund-question.json"];

let acmeRuns: AcmeRuns;
let transport: ConsoleTransport;
let serving: { signals: ReturnType<typeof fakeSignals>; done: Promise<number> } | undefined;
const opened: LocalEngine[] = [];

beforeEach(async () => {
  const folder = await mkdtemp(join(tmpdir(), "halonic-cli-run-via-serve-"));
  const acme = join(folder, "acme");
  await cp(acmeExample, acme, { recursive: true });
  await mkdir(join(folder, "profile"));
  const profile = {
    ...nodeProfileEnvironment(),
    variables: { HALONIC_HOME: join(folder, "profile") },
  };
  acmeRuns = { folder, acme, profile };
  transport = memoryConsole();
});

afterEach(async () => {
  if (serving !== undefined) {
    serving.signals.send("SIGINT");
    await serving.done.catch(() => undefined);
    serving = undefined;
  }
  await Promise.all(opened.splice(0).map((engine) => engine.close()));
  await removeAcmeRuns(acmeRuns);
});

const setup = () => ({ ...acmeRunsSetup(acmeRuns), console: transport });

/** Starts `halonic serve` on Acme and gives its address. */
async function startServe(): Promise<string> {
  const io = captureIo(acmeRuns.acme);
  const signals = fakeSignals();
  const done = runCli(["serve", "--port", "0"], io, [serveCommandWith(setup())], {
    stop: { signals, exitNow: () => undefined },
  });
  serving = { signals, done };
  await waitUntil("the server to print its address", () => io.stdout.length >= 1, {
    timeout: 10_000,
  });
  const found = /(http:\/\/localhost:\d+)/u.exec(io.stdout[0] ?? "");
  if (found?.[1] === undefined) throw new Error(`No address in ${JSON.stringify(io.stdout[0])}.`);
  return found[1];
}

/** Runs `halonic run support-reply <args>` on Acme. */
async function run(...args: string[]) {
  const io = captureIo(acmeRuns.acme);
  const code = await runCli(["run", "support-reply", ...args], io, [runCommandWith(setup())]);
  return { code, io };
}

/** Holds Acme's engine the way `holder` does, with no console to answer. */
async function holdEngine(holder: EngineHolder): Promise<void> {
  const engine = await openLocalEngine({
    workspace: await loadWorkspace(new FolderDefinitionStore(acmeRuns.acme, "./acme")),
    workspaceRoot: acmeRuns.acme,
    trusted: true,
    secrets: { get: async () => null },
    keyOrigins: noKeyOrigins,
    http: { fetch: () => Promise.reject(new TypeError("The test model calls no server.")) },
    environment: acmeRuns.profile,
    reportError: () => {},
    holder,
  });
  opened.push(engine);
}

/** The ids of the runs the served Inbox lists as waiting for an answer. */
async function waitingRunIds(address: string): Promise<string[]> {
  const response = await fetch(`${address}/api/waiting-runs`);
  const body = (await response.json()) as { runs: { id: string; status: string }[] };
  return body.runs.filter((each) => each.status === "waiting").map((each) => each.id);
}

verifies("cli.local-engine-lock", () => {
  it(
    "hands the run to the running serve, which lists it in its Inbox as waiting",
    slowTest,
    async () => {
      const address = await startServe();

      const { code, io } = await run(...samsEmail, "--json");

      expect(code).toBe(exitCode.ok);
      const result = JSON.parse(io.stdout.join("\n")) as { ok: boolean; run: { id: string } };
      expect(result).toMatchObject({ ok: true, startedBy: "serve" });
      await waitUntil("the run to wait in serve's Inbox", async () =>
        (await waitingRunIds(address)).includes(result.run.id),
      );
    },
  );

  it("says the running Studio started it and where to see it", slowTest, async () => {
    await startServe();

    const { code, io } = await run(...samsEmail);

    expect(code).toBe(exitCode.ok);
    expect(io.stdout.join("\n")).toMatch(
      /^✓ Started in the running Studio as run \S+\. Approve it on your phone when it asks\.\nSee where it is: halonic runs show \S+$/u,
    );
  });

  it(
    "keeps the refusal for an --event, which only a run followed here takes",
    slowTest,
    async () => {
      await startServe();

      const { code, io } = await run(...samsEmail, "--event", "approve");

      expect(code).toBe(exitCode.conflict);
      expect(io.stderr.join("\n")).toContain("halonic serve is running for this workspace");
    },
  );

  it("keeps the refusal when serve's console doesn't answer", slowTest, async () => {
    await holdEngine("serve");

    const { code, io } = await run(...samsEmail);

    expect(code).toBe(exitCode.conflict);
    expect(io.stderr.join("\n")).toContain("halonic serve is running for this workspace");
  });

  it("keeps the refusal when routines watch holds the engine", slowTest, async () => {
    await holdEngine("routinesWatch");

    const { code, io } = await run(...samsEmail);

    expect(code).toBe(exitCode.conflict);
    expect(io.stderr.join("\n")).toContain("halonic routines watch is running for this workspace");
  });
});
