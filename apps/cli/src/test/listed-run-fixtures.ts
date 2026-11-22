import type { WorkflowDefinition } from "@halonicjs/app";
import { type RunEventBody, type RunSends, type RunSummary, summarize } from "@halonicjs/events";
import { type FindWorkflow, listedRun } from "../commands/runs/listed-run.ts";
import { plainText } from "../messages/phrase.ts";
import type { RunClock } from "../run-times.ts";

// Shared setup for the `halonic runs` row tests, split across files by the rows they cover.

/** The workflow every test run belongs to, with a task, wait and odd-title step of each kind. */
export const supportReply = {
  version: 1,
  id: "support-reply",
  name: "Support reply",
  initial: "read",
  context: {},
  layout: {},
  states: {
    read: { type: "task", description: "Read the mail" },
    draft: { type: "task", description: "Draft a reply\nIn the customer's language." },
    review: { type: "wait", description: "Approve this reply?" },
    hold: { type: "wait" },
    shared: { type: "wait", description: "\u001b[2J\u001b[31mApprove\u202e this?" },
  },
} as unknown as WorkflowDefinition;

/** Finds `supportReply` in the hub `acme`, and nothing else. */
export const findWorkflow: FindWorkflow = (hubId, workflowId) =>
  hubId === "acme" && workflowId === "support-reply" ? supportReply : undefined;

/** 9 Nov 2026, 12:00 UTC, the list's "now", written in UTC. */
export const clock: RunClock = { now: new Date(Date.UTC(2026, 10, 9, 12, 0)), timeZone: "UTC" };

/** The `run.started` event every test run begins with. */
export const started: RunEventBody = {
  type: "run.started",
  hubId: "acme",
  workflowId: "support-reply",
  input: {},
  kind: "run",
  definitionsVersion: "v1",
};

/** A run's summary from its event bodies, the first at `startedAt` and each next one `stepMs` later. */
export function runOf(
  bodies: readonly RunEventBody[],
  startedAt: string,
  stepMs = 1000,
): RunSummary {
  const start = Date.parse(startedAt);
  const summary = summarize(
    bodies.map((body, index) => ({
      ...body,
      runId: "run_mfx3k2a1_a101jd8q",
      seq: index + 1,
      at: new Date(start + index * stepMs).toISOString(),
    })),
  );
  if (summary === null) {
    throw new Error("The test log has no run.started.");
  }
  return summary;
}

/** A run whose tool calls sent nothing, so its row has no sent part. */
export const toolCallsOnly: RunSends = { sent: [], maySend: [], madeToolCalls: true };

/** A run without a tool call, which "sent nothing". */
export const noToolCalls: RunSends = { sent: [], maySend: [], madeToolCalls: false };

/** The row as plain text; `sends` only matters for a completed run. */
export function row(summary: RunSummary, sends = toolCallsOnly) {
  const listed = listedRun({ summary, sends }, findWorkflow, clock);
  return {
    runId: listed.runId,
    status: listed.status,
    workflow: listed.workflow,
    what: plainText(listed.what),
    when: plainText(listed.when),
  };
}

/** A start time on the list's own day, 9 Nov 2026. */
export const today = "2026-11-09T10:31:00.000Z";
