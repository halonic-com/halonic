import type { WorkflowDefinition } from "@halonicjs/app";
import {
  type RunEvent,
  type RunEventBase,
  type RunEventBody,
  type RunSummary,
  summarize,
} from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { plainText } from "./messages/phrase.ts";
import { runMessages } from "./messages/run.ts";
import type { RunClock } from "./run-times.ts";
import { type AgentDefinition, type RunDefinitions, receiptOf, stepLines } from "./run-view.ts";

/** Acme's support-reply workflow, its steps as written there. */
const supportReply = {
  version: 1,
  id: "support-reply",
  name: "Support reply",
  initial: "read",
  context: {},
  layout: {},
  states: {
    read: { type: "task", agent: "writer", description: "Read the email" },
    classify: { type: "task", agent: "sorter", description: "Classify it" },
    draft: { type: "task", agent: "writer", description: "Draft a reply" },
    review: { type: "wait", description: "Approve this reply?\n{{context.reply}}" },
    checks: { type: "parallel", description: "Run the checks" },
    done: { type: "final" },
  },
} as unknown as WorkflowDefinition;

const agents: Record<string, AgentDefinition> = {
  writer: {
    id: "writer",
    name: "Writer",
    model: "smart",
    methods: {},
  } as unknown as AgentDefinition,
  sorter: {
    id: "sorter",
    name: "Sorter",
    model: "fast",
    methods: {},
  } as unknown as AgentDefinition,
};

const definitions: RunDefinitions = { workflow: supportReply, agent: (id) => agents[id] };

/** 10 Nov 2026, 15:00 UTC, written in UTC. */
const clock: RunClock = { now: new Date("2026-11-10T15:00:00Z"), timeZone: "UTC" };

/** A run log from event bodies, each with the time it happened at, today. */
function logOf(timed: readonly (readonly [string, RunEventBody])[]): RunEvent[] {
  const started: RunEventBody = {
    type: "run.started",
    hubId: "acme",
    workflowId: "support-reply",
    input: {},
    kind: "run",
    definitionsVersion: "v1",
  };
  const first = timed[0]?.[0] ?? "14:00:00";
  return [[first, started] as const, ...timed].map(([time, body], index) => ({
    ...body,
    runId: "run_mfx3k2a1_a101jd8q",
    seq: index + 1,
    at: `2026-11-10T${time}.000Z`,
  }));
}

/** The step lines as plain text, with each column gap made one space. */
function linesOf(events: readonly RunEvent[]): string[] {
  const summary = summarizeOrThrow(events);
  return stepLines(events, summary, definitions, clock).map((line) =>
    plainText(line).replace(/ {2,}/g, " "),
  );
}

function receiptText(events: readonly RunEvent[], cost = 0): string {
  const summary = summarizeOrThrow(events);
  return plainText(runMessages.receipt(receiptOf(events, { ...summary, cost })).phrase);
}

const entered = (state: string): RunEventBody => ({ type: "state.entered", state });
/** The run's end, as the engine logs it: it enters the end state, which completes the run. */
const finishedAt = (time: string) =>
  [
    [time, entered("done")],
    [time, { type: "run.completed", state: "done", context: {} }],
  ] as const;
const agentStarted = (state: string, agent: string): RunEventBody => ({
  type: "agent.started",
  state,
  agent,
  prompt: "",
});
const waiting: RunEventBody = {
  type: "run.waiting",
  state: "review",
  events: ["approve", "reject"],
  title: "Approve this reply?",
};

/** An event of one branch of a parallel state. */
const inBranch = (
  branch: string,
  body: RunEventBody,
): RunEventBody & Pick<RunEventBase, "branch"> => ({ ...body, branch });

/** The `approval.requested` of a tool call the agent of `state` makes. */
const approvalRequested = (state: string, callId: string): RunEventBody =>
  ({
    type: "approval.requested",
    state,
    agent: "writer",
    tool: "gmail_send",
    args: {},
    callId,
    resume: { messages: [], step: 0 },
  }) as unknown as RunEventBody;

/** Acme's run up to the wait step: read, then draft, then waiting at 14:02:10. */
const upToTheWait = [
  ["14:00:00", entered("read")],
  ["14:00:00", agentStarted("read", "writer")],
  ["14:00:01", entered("draft")],
  ["14:00:01", agentStarted("draft", "writer")],
  ["14:00:10", entered("review")],
  ["14:02:10", waiting],
] as const;

/** Acme's Draft a reply step, whose agent asks to send an email at 14:00:05. */
const draftAsksApproval: readonly (readonly [string, RunEventBody])[] = [
  ["14:00:00", entered("draft")],
  ["14:00:00", agentStarted("draft", "writer")],
  ["14:00:05", approvalRequested("draft", "call-1")],
  ["14:00:05", { type: "run.waiting", state: "draft", events: ["approve", "reject"] }],
];

verifies("cli.run-view", () => {
  it("shows each step a finished run reached, with what ran it and how long it took", () => {
    const events = logOf([
      ...upToTheWait,
      ["14:02:30", { type: "event.received", event: "approve" }],
      ...finishedAt("14:02:30"),
    ]);
    expect(linesOf(events)).toEqual([
      "✓ Read the email Writer · smart 1 s",
      "✓ Draft a reply Writer · smart 9 s",
      "! Approve this reply? you approved at 14:02",
    ]);
  });

  it("lines the steps up in columns", () => {
    const events = logOf([
      ...upToTheWait,
      ["14:02:30", { type: "event.received", event: "hold" }],
      ...finishedAt("14:02:30"),
    ]);
    const summary = summarizeOrThrow(events);
    expect(stepLines(events, summary, definitions, clock).map((line) => plainText(line))).toEqual([
      "✓ Read the email        Writer · smart               1 s",
      "✓ Draft a reply         Writer · smart               9 s",
      "! Approve this reply?   you answered hold at 14:02",
    ]);
  });

  it("ends a failed run's lines with the step it failed in", () => {
    const events = logOf([
      ["14:00:00", entered("read")],
      ["14:00:00", agentStarted("read", "writer")],
      ["14:00:01", entered("classify")],
      ["14:00:01", agentStarted("classify", "sorter")],
      [
        "14:00:02",
        { type: "run.failed", state: "classify", error: "no tools", reason: "model-no-tools" },
      ],
    ]);
    expect(linesOf(events)).toEqual([
      "✓ Read the email Writer · smart 1 s",
      "✕ Classify it Sorter · fast 1 s",
    ]);
  });

  it("says since when the step a run is in runs, and shows no step it hasn't reached", () => {
    const events = logOf([
      ["10:53:00", entered("read")],
      ["10:53:00", agentStarted("read", "writer")],
      ["10:53:02", entered("draft")],
      ["10:53:02", agentStarted("draft", "writer")],
    ]);
    expect(linesOf(events)).toEqual([
      "✓ Read the email Writer · smart 2 s",
      "◌ Draft a reply Writer · smart · running since 10:53",
    ]);
  });

  it("says since when a run waits for the user's answer", () => {
    expect(linesOf(logOf(upToTheWait)).at(-1)).toBe(
      "! Approve this reply? waiting for you since 14:02",
    );
  });

  it("marks an agent step whose tool call waits for the user's OK with a !", () => {
    const events = logOf([...draftAsksApproval]);
    expect(linesOf(events)).toEqual(["! Draft a reply Writer · smart"]);
  });

  it("shows an agent step whose tool call the user approved as a step that finished, asked once", () => {
    const events = logOf([
      ...draftAsksApproval,
      [
        "14:00:20",
        {
          type: "approval.resolved",
          state: "draft",
          agent: "writer",
          tool: "gmail_send",
          callId: "call-1",
          approved: true,
        },
      ],
      ["14:00:20", { type: "event.received", event: "approve" }],
      ...finishedAt("14:00:30"),
    ]);
    expect(linesOf(events)).toEqual(["✓ Draft a reply Writer · smart 30 s"]);
    expect(receiptOf(events, summarizeOrThrow(events)).askedYou).toBe(1);
  });

  it("marks a parallel step with a !, when a branch waits for the user's OK on a tool call", () => {
    const events = logOf([
      ["14:00:00", entered("checks")],
      ["14:00:00", inBranch("left", entered("draft"))],
      ["14:00:00", inBranch("right", entered("draft"))],
      ["14:00:05", inBranch("left", approvalRequested("draft", "call-1"))],
      ["14:00:06", inBranch("right", approvalRequested("draft", "call-2"))],
      [
        "14:00:20",
        inBranch("right", {
          type: "approval.resolved",
          state: "draft",
          agent: "writer",
          tool: "gmail_send",
          callId: "call-2",
          approved: true,
        }),
      ],
      ["14:00:20", inBranch("left", { type: "run.waiting", state: "draft", events: ["approve"] })],
    ]);
    expect(linesOf(events)).toEqual(["! Run the checks"]);
  });

  it("marks a parallel step with a !, when a branch's wait step waits for the user", () => {
    const events = logOf([
      ["14:00:00", entered("checks")],
      ["14:00:00", inBranch("left", entered("review"))],
      ["14:02:10", inBranch("left", waiting)],
    ]);
    expect(linesOf(events)).toEqual(["! Run the checks waiting for you since 14:02"]);
  });

  it("names a step's agent by the model alias of the method it calls", () => {
    const withMethod = {
      ...supportReply,
      states: { ...supportReply.states, read: { type: "task", agent: "writer", method: "read" } },
    } as unknown as WorkflowDefinition;
    const writer = {
      ...agents["writer"],
      methods: { read: { model: "fast" } },
    } as unknown as AgentDefinition;
    const events = logOf([
      ["14:00:00", entered("read")],
      ["14:00:00", agentStarted("read", "writer")],
      ...finishedAt("14:00:01"),
    ]);
    const summary = summarizeOrThrow(events);
    const lines = stepLines(events, summary, { workflow: withMethod, agent: () => writer }, clock);
    expect(lines.map((line) => plainText(line).replace(/ {2,}/g, " "))).toEqual([
      "✓ Read Writer · fast 1 s",
    ]);
  });

  it("names an agent without its own model by the default alias, and by its name alone with none", () => {
    const events = logOf([
      ["14:00:00", entered("read")],
      ["14:00:00", agentStarted("read", "writer")],
      ...finishedAt("14:00:01"),
    ]);
    const summary = summarizeOrThrow(events);
    const { model: _, ...withoutModel } = agents["writer"] as AgentDefinition;
    const writer = withoutModel as AgentDefinition;
    const linesWith = (defaults: Partial<RunDefinitions>) =>
      stepLines(
        events,
        summary,
        { workflow: supportReply, agent: () => writer, ...defaults },
        clock,
      ).map((line) => plainText(line).replace(/ {2,}/g, " "));
    expect(linesWith({ defaultModel: "default" })).toEqual([
      "✓ Read the email Writer · default 1 s",
    ]);
    expect(linesWith({})).toEqual(["✓ Read the email Writer 1 s"]);
  });

  it("names an agent that's no longer in the workspace by its id, and gives the end state no line", () => {
    const events = logOf([
      ["14:00:00", entered("read")],
      ["14:00:00", agentStarted("read", "writer")],
      ...finishedAt("14:00:01"),
    ]);
    const summary = summarizeOrThrow(events);
    const lines = stepLines(
      events,
      summary,
      { workflow: undefined, agent: () => undefined },
      clock,
    );
    expect(lines.map((line) => plainText(line).replace(/ {2,}/g, " "))).toEqual([
      "✓ Read writer 1 s",
    ]);
  });

  it("says a run without a tool call sent nothing, and counts each time it asked", () => {
    const events = logOf([
      ...upToTheWait,
      ["14:02:30", { type: "event.received", event: "approve" }],
      ...finishedAt("14:02:30"),
    ]);
    expect(receiptText(events, 0.004)).toBe(
      "Sent nothing · asked you once · estimated cost €0.004",
    );
  });

  it("leaves the sent part out for a run with tool calls, and the cost for one without a price", () => {
    const events = logOf([
      ["14:00:00", entered("read")],
      ["14:00:01", { type: "tool.called", agent: "writer", tool: "gmail_read", args: {} }],
      ...finishedAt("14:00:02"),
    ]);
    expect(receiptOf(events, summarizeOrThrow(events))).toEqual({
      changedFiles: 0,
      askedYou: 0,
    });
    expect(receiptText(events)).toBe("");
  });
});

/** The run's summary; every test log starts with `run.started`. */
function summarizeOrThrow(events: readonly RunEvent[]): RunSummary {
  const summary = summarize(events);
  if (summary === null) {
    throw new Error("The test log has no run.started.");
  }
  return summary;
}
