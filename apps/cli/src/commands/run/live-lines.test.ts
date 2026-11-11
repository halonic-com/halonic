import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { type RunDetail, RunEvents, shortRunId, WorkflowRuns } from "@halonicjs/app";
import type { RunEvent } from "@halonicjs/events";
import { fixedClock } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { CommandContext } from "../../command.ts";
import { openLocalEngine } from "../../local-engine-host.ts";
import { type Phrase, plainText } from "../../messages/phrase.ts";
import { type Clock, type LiveLine, startProgress } from "../../output/progress.ts";
import type { RunClock } from "../../run-times.ts";
import { manualClock } from "../../test/manual-clock.ts";
import { engineStart } from "../../test/run-setup.ts";
import { nodeProfileEnvironment } from "../../workspace-runs.ts";
import { liveLines } from "./live-lines.ts";
import { runProgress, runResult } from "./result.ts";

const acmeExample = fileURLToPath(new URL("../../../../../examples/acme", import.meta.url));

/** The step lines' clock: the day the engine's own clock runs on. */
const runClock: RunClock = { now: new Date(engineStart + 60_000), timeZone: "UTC" };

let folder: string;
let workspace: LoadedWorkspace;
/** Support reply on Sam's email, to its wait at Approve this reply?. */
let waiting: RunDetail;
/** The same run after `approve`, to its end. */
let approved: RunDetail;

// One run for the whole file: the tests only read it. Running it before each
// test took up to 4 s a test in CI (HAL-5473).
beforeAll(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-cli-run-live-"));
  const acme = join(folder, "acme");
  await cp(acmeExample, acme, { recursive: true });
  const ranIn = await loadWorkspace(new FolderDefinitionStore(acme, "./acme"));
  const engine = await openLocalEngine({
    workspace: ranIn,
    workspaceRoot: acme,
    secrets: { get: async () => null },
    http: { fetch: () => Promise.reject(new TypeError("no server")) },
    environment: { ...nodeProfileEnvironment(), variables: { HALONIC_HOME: join(folder, "home") } },
    reportError: (error) => {
      throw error;
    },
    // A clock that stands still, so every step takes "1 s" however slow the
    // machine is; on the real clock a slow Windows runner printed "2 s" (HAL-5925).
    clock: fixedClock(engineStart, 0),
  });
  try {
    const input = JSON.parse(await readFile(join(acme, "examples/refund-question.json"), "utf8"));
    const workflowRuns = new WorkflowRuns(engine.executor);
    const started = await workflowRuns.startRun(ranIn, "support-reply", input);
    if (started.found !== "one") throw new Error("Support reply didn't start.");
    waiting = started.run;
    await new RunEvents(engine.executor, engine.runs).sendEvent(waiting.summary.id, "approve");
    approved = await workflowRuns.follow(waiting.summary.id, { after: waiting.summary.lastSeq });
  } finally {
    await engine.close();
  }
  // A provider for the live line to name, and the Writer on its "smart" alias,
  // as cli-output 3.4 shows them; the run itself only used the test model.
  await writeFile(
    join(acme, "providers/anthropic.yaml"),
    "id: anthropic\nname: Anthropic\ntype: anthropic\nsecret: anthropic\n",
  );
  const models = await readFile(join(acme, "models.yaml"), "utf8");
  await writeFile(
    join(acme, "models.yaml"),
    `${models}  smart:\n    provider: anthropic\n    model: a-model\n`,
  );
  const writer = join(acme, "hubs/support/agents/writer.agent.yaml");
  await writeFile(writer, `${await readFile(writer, "utf8")}model: smart\n`);
  workspace = await loadWorkspace(new FolderDefinitionStore(acme, "./acme"));
});

afterAll(async () => {
  await rm(folder, { recursive: true, force: true });
});

/** What the command did through its context, in order, as plain text. */
type Seen = readonly ["ahead" | "progress", string];

/** A context that keeps what it was asked to print and draw; its live lines draw nothing. */
function recordedContext(): Pick<CommandContext, "printAhead" | "progress"> & {
  readonly seen: Seen[];
} {
  const seen: Seen[] = [];
  return {
    seen,
    printAhead: (line) => seen.push(["ahead", plainText(line)]),
    progress: (doing) => {
      seen.push(["progress", plainText(doing)]);
      return { waitingFor: () => {}, end: () => {} };
    },
  };
}

/** Hands `events` to `onEvent` one by one, as a follow from the first event does. */
function follow(
  onEvent: (event: RunEvent, events: readonly RunEvent[]) => void,
  events: readonly RunEvent[],
): void {
  const read: RunEvent[] = [];
  for (const event of events) {
    read.push(event);
    onEvent(event, read);
  }
}

const facts = () => ({ workspace, workspaceName: "acme", clock: runClock });

const printed = (seen: readonly Seen[]) =>
  seen.filter(([what]) => what === "ahead").map(([, line]) => line);

verifies("cli.run-live", () => {
  it("prints each step's line as the step ends, before the next step's live line", () => {
    const context = recordedContext();
    follow(liveLines(context, facts()).onEvent, waiting.events);
    expect(context.seen).toEqual([
      ["ahead", `Running Support reply in acme · run ${shortRunId(waiting.summary.id)}`],
      // The live line adds "◌ ", so its facts line up with the ✓ lines.
      ["progress", "Read the email        Writer · smart"],
      ["ahead", ""],
      ["ahead", "✓ Read the email        Writer · smart     1 s"],
      ["progress", "Classify it           Sorter · default"],
      ["ahead", "✓ Classify it           Sorter · default   1 s"],
      ["progress", "Draft a reply         Writer · smart"],
      ["ahead", "✓ Draft a reply         Writer · smart     1 s"],
      ["progress", "Approve this reply?"],
    ]);
  });

  it("prints the lines the result starts with, word for word", () => {
    const context = recordedContext();
    follow(liveLines(context, facts()).onEvent, approved.events);
    const result = runResult(approved, { ...facts(), dir: undefined });
    const lines = printed(context.seen);
    expect(lines).toHaveLength(6);
    expect(lines).toEqual(result.lines.slice(0, lines.length).map(plainText));
  });

  it("prints each line once when the run is followed again after an --event", () => {
    const context = recordedContext();
    const live = liveLines(context, facts());
    follow(live.onEvent, waiting.events);
    follow(live.onEvent, approved.events);
    const lines = printed(context.seen);
    expect(lines.filter((line) => line.startsWith("✓ Read the email"))).toHaveLength(1);
    expect(lines.at(-1)).toMatch(/^! Approve this reply\? {3}you approved at \d\d:\d\d$/);
    expect(lines).toHaveLength(6);
  });

  it("leaves the heading out for runs send, and prints the lines its result goes on with", () => {
    const context = recordedContext();
    follow(liveLines(context, { ...facts(), heading: false }).onEvent, approved.events);
    const progress = runProgress(approved, { ...facts(), dir: undefined });
    const lines = printed(context.seen);
    expect(lines).toHaveLength(5);
    expect(lines).toEqual(progress.lines.slice(0, lines.length).map(plainText));
  });

  it("names the provider a step has waited on for 10 seconds, padded to the step column", () => {
    const clock = manualClock();
    const line = recordedLine();
    const context = liveContext(clock, line);
    const live = liveLines(context, facts());
    follow(live.onEvent, [...untilAgentOf("draft"), llmRequest("anthropic")]);
    clock.advance(12_000);
    expect(line.seen.at(-1)).toBe(
      "◌ Draft a reply         Writer · smart · waiting for Anthropic (12 s)",
    );
  });

  it("takes the live line away when the follow ends mid-step", () => {
    const clock = manualClock();
    const line = recordedLine();
    const live = liveLines(liveContext(clock, line), facts());
    follow(live.onEvent, untilAgentOf("draft"));
    clock.advance(2_000);
    live.end();
    expect(line.seen).toEqual(["◌ Draft a reply         Writer · smart", "(cleared)"]);
  });
});

/** The waiting run's log up to the agent of `state` starting. */
function untilAgentOf(state: string): RunEvent[] {
  const index = waiting.events.findIndex(
    (event) => event.type === "agent.started" && event.state === state,
  );
  return waiting.events.slice(0, index + 1);
}

/** A model call to `provider` right after the last event of `untilAgentOf`. */
function llmRequest(provider: string): RunEvent {
  const last = waiting.events.find(
    (event) => event.type === "agent.started" && event.state === "draft",
  );
  if (last === undefined) throw new Error("The run never drafted a reply.");
  return {
    type: "llm.request",
    agent: "writer",
    provider,
    model: "a-model",
    messages: 1,
    runId: last.runId,
    seq: last.seq + 1,
    at: last.at,
  };
}

/** A live line that keeps each drawn line as plain text, and "(cleared)". */
function recordedLine(): LiveLine & { readonly seen: string[] } {
  const seen: string[] = [];
  return {
    seen,
    draw: (message) => seen.push(plainText(message.phrase)),
    clear: () => seen.push("(cleared)"),
  };
}

/** A context whose live lines draw on `line`, on a terminal, with `clock`. */
function liveContext(
  clock: Clock,
  line: LiveLine,
): Pick<CommandContext, "printAhead" | "progress"> {
  return {
    printAhead: (_line: Phrase) => {},
    progress: (doing) => startProgress(doing, { live: true, line, clock }),
  };
}
