import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { runCli } from "../../run-cli.ts";
import {
  type AcmeRuns,
  acmeRunsSetup,
  makeAcmeRuns,
  removeAcmeRuns,
  writeFiles,
} from "../../test/acme-runs.ts";
import { captureIo } from "../../test/capture-io.ts";
import { fakeSignals } from "../../test/fake-signals.ts";
import { waitUntil } from "../../test/wait-until.test-helper.ts";
import { openWorkspaceDir } from "../../workspace-dir.ts";
import { cliTrustService, readWorkspaceTrust } from "../../workspace-trust.ts";
import type { RunSetup } from "../run/run.ts";
import { serveCommandWith } from "./command.ts";

/** The first start opens the engine and the listener from cold imports. */
const slowStart = { timeout: 10_000 };

let acmeRuns: AcmeRuns;

/** The server the test started, which `afterEach` stops if the test failed before it did. */
let running: { signals: ReturnType<typeof fakeSignals>; serving: Promise<number> } | undefined;

beforeEach(async () => {
  acmeRuns = await makeAcmeRuns("serve");
});

afterEach(async () => {
  if (running !== undefined) {
    running.signals.send("SIGINT");
    await running.serving.catch(() => undefined);
    running = undefined;
  }
  await removeAcmeRuns(acmeRuns);
});

/** Trusts Acme as `halonic trust` does. */
async function trustAcme(): Promise<void> {
  const setup = acmeRunsSetup(acmeRuns);
  const dir = await openWorkspaceDir(
    { positionals: [], options: { dir: acmeRuns.acme } },
    { cwd: acmeRuns.folder },
  );
  const machine = setup.trust();
  const { subject } = await readWorkspaceTrust(dir, machine.commandSearch);
  const service = cliTrustService(machine.trustStore, machine.clock);
  const check = await service.check(subject);
  if (!("fingerprint" in check)) throw new Error("Acme has no fingerprint.");
  await service.grant(subject, check.fingerprint, "cli");
}

function startServe(...args: string[]) {
  return startServeWith(acmeRunsSetup(acmeRuns), ...args);
}

/** Like {@link startServe}, for a computer whose home folder is `homeFolder`. */
function startServeHomedAt(homeFolder: string, ...args: string[]) {
  const setup = acmeRunsSetup({ ...acmeRuns, profile: { ...acmeRuns.profile, homeFolder } });
  return startServeWith(setup, ...args);
}

function startServeWith(setup: RunSetup, ...args: string[]) {
  const io = captureIo(acmeRuns.acme);
  const signals = fakeSignals();
  const serving = runCli(["serve", ...args], io, [serveCommandWith(setup)], {
    stop: { signals, exitNow: () => undefined },
  });
  running = { signals, serving };
  return { io, signals, serving };
}

/** The address from the "Serving Acme at http://localhost:1234." line. */
function addressOf(line: string | undefined): string {
  const found = /(http:\/\/localhost:\d+)/u.exec(line ?? "");
  if (found?.[1] === undefined) throw new Error(`No address in ${JSON.stringify(line)}.`);
  return found[1];
}

verifies("cli.commands.serve.serve", () => {
  it("serves a trusted workspace on this computer until Ctrl C", async () => {
    await trustAcme();
    const { io, signals, serving } = startServe("--port", "0");
    await waitUntil(() => io.stdout.length >= 1, slowStart);
    const address = addressOf(io.stdout[0]);
    expect(io.stdout[0]).toMatch(/^Serving Acme at http:\/\/localhost:\d+\. Stop with Ctrl C\.$/u);
    expect(io.stdout[1]).toContain("halonic secret set serve-password");

    const hello = await fetch(`${address}/api/hello`);
    expect(await hello.json()).toMatchObject({ product: "halonic" });

    signals.send("SIGINT");
    expect(await serving).toBe(130);
    running = undefined;
    await expect(fetch(`${address}/api/hello`)).rejects.toThrow();
  });

  it("tells a workspace under the home folder by its path from home, with a ~", async () => {
    await trustAcme();
    const { io } = startServeHomedAt(acmeRuns.folder, "--port", "0");
    await waitUntil(() => io.stdout.length >= 1, slowStart);
    const address = addressOf(io.stdout[0]);

    const workspace = await (await fetch(`${address}/api/workspace`)).json();
    expect(workspace).toEqual({ name: "Acme", sample: false, folder: "~/acme" });
  });

  it("tells a workspace outside the home folder by its own name only, never its absolute path", async () => {
    await trustAcme();
    const { io } = startServeHomedAt(join(acmeRuns.folder, "profile"), "--port", "0");
    await waitUntil(() => io.stdout.length >= 1, slowStart);
    const address = addressOf(io.stdout[0]);

    const workspace = await (await fetch(`${address}/api/workspace`)).json();
    expect(workspace).toEqual({ name: "Acme", sample: false, folder: "acme" });
  });

  it("asks the trust gate again for every request, so an edit after the start shows as changed", async () => {
    await trustAcme();
    const { io } = startServe("--port", "0");
    await waitUntil(() => io.stdout.length >= 1, slowStart);
    const address = addressOf(io.stdout[0]);
    expect(await (await fetch(`${address}/api/trust`)).json()).toMatchObject({ state: "trusted" });

    // The edit trust must notice: a connector that starts a program.
    await writeFiles(acmeRuns.acme, {
      "library/connectors/files.connector.yaml": JSON.stringify({
        transport: { stdio: { command: "node", args: ["server.js"] } },
      }),
    });
    const trustCard = (await (await fetch(`${address}/api/trust`)).json()) as { state: string };
    expect(trustCard.state).not.toBe("trusted");
    const started = await fetch(`${address}/api/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hubId: "hub", workflowId: "triage", input: {} }),
    });
    expect(started.status).toBe(403);
    expect(await started.json()).toMatchObject({ code: "workspace_not_trusted" });
  });

  it("refuses a workspace that isn't trusted here and listens on nothing", async () => {
    const { io, serving } = startServe("--port", "0");

    expect(await serving).toBe(3);
    running = undefined;
    expect(io.stdout.join("\n")).not.toContain("Serving");
    expect(io.stderr.join("\n")).toContain("Nothing was served.");
  });

  it("refuses --port that isn't a port number", async () => {
    await trustAcme();
    const { io, serving } = startServe("--port", "70000");

    expect(await serving).toBe(2);
    running = undefined;
    expect(io.stderr.join("\n")).toContain("--port needs a whole number from 0 to 65535.");
  });

  it("refuses --network without a sign-in password, and says how to set one", async () => {
    await trustAcme();
    const { io, serving } = startServe("--network", "--port", "0");

    expect(await serving).toBe(2);
    running = undefined;
    expect(io.stderr.join("\n")).toContain("halonic secret set serve-password");
  });
});
