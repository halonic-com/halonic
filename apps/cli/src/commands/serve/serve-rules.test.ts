import type { RunEvent } from "@halonicjs/events";
import { verifies, waitUntil } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
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
import { openWorkspaceRuns } from "../../workspace-runs.ts";
import { runCommandWith } from "../run/command.ts";
import { serveCommandWith } from "./command.ts";

// `halonic serve` runs a workflow's rule steps in a worker thread per rule
// (HAL-18669); `halonic run` still refuses them. The workspace has no model at all.

/** The first start opens the engine and the listener from cold imports; a spinning rule takes 2.5 s. */
const slowTest = { timeout: 60_000 };

/** A workflow whose rule step `match` runs `rule`, then a final step that sends what it picked. */
function ruleWorkflow(id: string, rule: string): string {
  return [
    `id: ${id}`,
    `name: ${id}`,
    "initial: match",
    "states:",
    "  match:",
    "    type: rule",
    `    rule: ${rule}`,
    "    input:",
    '      prs: "{{input.prs}}"',
    "    output: decisions",
    "    on:",
    "      - to: done",
    "        event: done",
    "  done:",
    "    type: final",
    "    signal:",
    "      name: prs.picked",
    "      data:",
    '        merge: "{{context.decisions.merge}}"',
    "",
  ].join("\n");
}

let acmeRuns: AcmeRuns;
let running: { signals: ReturnType<typeof fakeSignals>; serving: Promise<number> } | undefined;

beforeEach(async () => {
  acmeRuns = await makeAcmeRuns("serve-rules");
  await writeFiles(acmeRuns.acme, {
    "hubs/watch/hub.yaml": "id: watch\nname: Watch\n",
    "hubs/watch/rules/pick.rule.js":
      "export function run(ctx) { return { merge: ctx.input.prs.slice(1) }; }\n",
    "hubs/watch/rules/spin.rule.js": "export function run() { for (;;) {} }\n",
    "hubs/watch/workflows/pick.workflow.yaml": ruleWorkflow("pick", "rules/pick.rule.js"),
    "hubs/watch/workflows/spin.workflow.yaml": ruleWorkflow("spin", "rules/spin.rule.js"),
  });
});

afterEach(async () => {
  if (running !== undefined) {
    running.signals.send("SIGINT");
    await running.serving.catch(() => undefined);
    running = undefined;
  }
  await removeAcmeRuns(acmeRuns);
});

/** Starts `halonic serve` on Acme and gives its address. */
async function serveAcme(): Promise<string> {
  const io = captureIo(acmeRuns.acme);
  const signals = fakeSignals();
  const command = serveCommandWith({ ...acmeRunsSetup(acmeRuns), studioFolder: null });
  const serving = runCli(["serve", "--port", "0"], io, [command], {
    stop: { signals, exitNow: () => undefined },
  });
  running = { signals, serving };
  await waitUntil("the server to print its address", () => io.stdout.length >= 1, slowTest);
  const found = /(http:\/\/localhost:\d+)/u.exec(io.stdout[0] ?? "");
  if (found?.[1] === undefined) throw new Error(`No address in ${JSON.stringify(io.stdout[0])}.`);
  return found[1];
}

/** Starts the workflow `workflowId` of the watch hub over the served API and gives the run's id. */
async function startRun(address: string, workflowId: string): Promise<string> {
  const started = await fetch(`${address}/api/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ hubId: "watch", workflowId, input: { prs: [5, 7, 9] } }),
  });
  expect(started.status).toBe(200);
  return ((await started.json()) as { id: string }).id;
}

async function statusOf(address: string, id: string): Promise<string> {
  return ((await (await fetch(`${address}/api/runs/${id}`)).json()) as { status: string }).status;
}

async function eventsOf(id: string): Promise<readonly RunEvent[]> {
  return (await openWorkspaceRuns(acmeRuns.acme, acmeRuns.profile)).events(id);
}

verifies("cli.serve-rules", () => {
  it("runs a rule step with no model, and its output reaches the next step", slowTest, async () => {
    const address = await serveAcme();
    const id = await startRun(address, "pick");
    await waitUntil(
      "the run to end",
      async () => (await statusOf(address, id)) !== "running",
      slowTest,
    );
    expect(await statusOf(address, id)).toBe("completed");
    const events = await eventsOf(id);
    expect(events.filter((event) => event.type.startsWith("llm."))).toEqual([]);
    expect(events).toContainEqual(
      expect.objectContaining({ type: "signal.sent", data: { merge: [7, 9] } }),
    );
  });

  it(
    "fails a rule that never ends at limit.cpu, and another run completes while it spins",
    slowTest,
    async () => {
      const address = await serveAcme();
      const spinning = await startRun(address, "spin");
      const picking = await startRun(address, "pick");
      await waitUntil(
        "the second run to end",
        async () => (await statusOf(address, picking)) !== "running",
        slowTest,
      );
      // The second run completed before the first one failed: the server's event loop was free.
      expect(await statusOf(address, picking)).toBe("completed");
      expect(await statusOf(address, spinning)).toBe("running");
      await waitUntil(
        "the spinning run to end",
        async () => (await statusOf(address, spinning)) !== "running",
        slowTest,
      );
      expect(await statusOf(address, spinning)).toBe("failed");
      expect((await eventsOf(spinning)).at(-1)).toMatchObject({
        type: "run.failed",
        state: "match",
        error: expect.stringMatching(/^Rule step "match" failed with limit\.cpu/),
      });
    },
  );

  it("still refuses a rule step under halonic run", slowTest, async () => {
    const io = captureIo(acmeRuns.acme);
    const code = await runCli(["run", "pick", "--input", '{"prs":[5,7,9]}'], io, [
      runCommandWith(acmeRunsSetup(acmeRuns)),
    ]);
    expect(code).toBe(exitCode.failed);
    expect(io.stdout.join("\n")).toContain(
      'Step "match" is a rule step, and rule steps can\'t run here yet. Remove the step to run this workflow.',
    );
  });
});
