import type { WorkflowDefinition } from "@halonicjs/app";
import { describe, expect, it } from "vitest";
import { plainText } from "../../messages/phrase.ts";
import { clock, row, runOf, started, supportReply, today } from "../../test/listed-run-fixtures.ts";
import { listedRun } from "./listed-run.ts";

describe("listedRun: waits and Needs you", () => {
  it("shows a run at a wait step with the waiting line's words", () => {
    const summary = runOf(
      [
        started,
        { type: "state.entered", state: "review" },
        { type: "run.waiting", state: "review", events: ["approve", "reject"] },
      ],
      today,
    );

    expect(row(summary)).toMatchObject({
      status: "needsYou",
      what: "Waiting for you: Approve this reply?",
    });
  });

  it("shows the wait step's title as the engine filled it in, not as written (HAL-7012)", () => {
    const summary = runOf(
      [
        started,
        { type: "state.entered", state: "review" },
        {
          type: "run.waiting",
          state: "review",
          events: ["approve", "reject"],
          title: "Approve the reply to Ada",
          body: "Hi Ada, thanks for writing.",
        },
      ],
      today,
    );

    expect(row(summary)).toMatchObject({
      status: "needsYou",
      what: "Waiting for you: Approve the reply to Ada",
    });
  });

  it("falls back to the wait step's description as written for a log without the filled-in title", () => {
    const placeholder = {
      ...supportReply,
      states: {
        ...supportReply.states,
        review: { type: "wait", description: "Approve the reply to {{context.name}}" },
      },
    } as unknown as WorkflowDefinition;
    const summary = runOf(
      [
        started,
        { type: "state.entered", state: "review" },
        { type: "run.waiting", state: "review", events: ["approve", "reject"] },
      ],
      today,
    );

    const listed = listedRun({ summary }, () => placeholder, clock);

    expect(plainText(listed.what)).toBe("Waiting for you: Approve the reply to {{context.name}}");
  });

  it("shows an escape code in the filled-in title as its code", () => {
    const summary = runOf(
      [
        started,
        { type: "state.entered", state: "review" },
        {
          type: "run.waiting",
          state: "review",
          events: ["approve"],
          title: "Approve \u001b[31mthis",
        },
      ],
      today,
    );

    expect(row(summary)).toMatchObject({ what: "Waiting for you: Approve \\u001b[31mthis" });
  });

  it("names the step when the wait step has no description", () => {
    const summary = runOf(
      [
        started,
        { type: "state.entered", state: "hold" },
        { type: "run.waiting", state: "hold", events: ["approve"] },
      ],
      today,
    );

    expect(row(summary)).toMatchObject({
      status: "needsYou",
      what: "Waiting for you in the step Hold",
    });
  });

  it("shows an escape code or a bidi control in the wait step's description as its code", () => {
    const summary = runOf(
      [
        started,
        { type: "state.entered", state: "shared" },
        { type: "run.waiting", state: "shared", events: ["approve"] },
      ],
      today,
    );

    expect(row(summary)).toMatchObject({
      status: "needsYou",
      what: "Waiting for you: \\u001b[2J\\u001b[31mApprove\\u202e this?",
    });
  });

  it("shows a tool approval as Needs you, in the step whose agent asked", () => {
    const summary = runOf(
      [
        started,
        { type: "state.entered", state: "draft" },
        {
          type: "approval.requested",
          state: "draft",
          agent: "writer",
          tool: "gmail__send",
          args: {},
          callId: "c1",
          resume: { messages: [], calls: [], step: 0 },
        },
        { type: "run.waiting", state: "draft", events: ["approve", "reject"] },
      ],
      today,
    );

    expect(row(summary)).toMatchObject({
      status: "needsYou",
      what: "Waiting for your approval in the step Draft a reply",
    });
  });

  it("shows a running run with an open approval as Needs you, as Studio does", () => {
    const summary = runOf(
      [
        started,
        { type: "state.entered", state: "draft" },
        {
          type: "approval.requested",
          state: "draft",
          agent: "writer",
          tool: "gmail__send",
          args: {},
          callId: "c1",
          resume: { messages: [], calls: [], step: 0 },
        },
      ],
      today,
    );

    expect(summary.status).toBe("running");
    expect(row(summary)).toMatchObject({
      status: "needsYou",
      what: "Waiting for your approval in the step Draft a reply",
    });
  });

  it('shows a run asked "Allow this address?" in Studio as Needs you, naming the dialog and Studio', () => {
    const question = { provider: "gateway", key: "gateway-key", origin: "https://gw.example" };
    const summary = runOf(
      [
        started,
        { type: "state.entered", state: "draft" },
        { type: "key-origin.asked", ...question },
      ],
      today,
    );

    expect(row(summary)).toMatchObject({
      status: "needsYou",
      what: 'Waiting for your answer to "Allow this address?" in Studio, in the step Draft a reply',
    });
  });

  it("shows a run waiting for its child run as Waiting, by the child's short id", () => {
    const summary = runOf(
      [
        started,
        { type: "state.entered", state: "review" },
        {
          type: "run.waiting",
          state: "review",
          events: ["approve"],
          child: "run_mfx3k2a1_9c7k2m9p",
        },
      ],
      today,
    );

    expect(row(summary)).toMatchObject({
      status: "waiting",
      what: "Waiting for child run 7k2m9p",
    });
  });

  it.each([
    ["2026-11-09T14:00:00.000Z", "Waiting until 14:00"],
    ["2026-11-10T08:00:00.000Z", "Waiting until tomorrow 08:00"],
    ["2026-12-03T08:00:00.000Z", "Waiting until 3 Dec 08:00"],
  ])("shows a run waiting for a timer due at %s as %j", (at, what) => {
    const summary = runOf(
      [
        started,
        { type: "state.entered", state: "hold" },
        { type: "run.waiting", state: "hold", events: [], timers: [{ after: "2h", at }] },
      ],
      today,
    );

    expect(row(summary)).toMatchObject({ status: "waiting", what });
  });

  it("shows a run that waits for nothing it names as Waiting in its step", () => {
    const summary = runOf(
      [
        started,
        { type: "state.entered", state: "hold" },
        { type: "run.waiting", state: "hold", events: [] },
      ],
      today,
    );

    expect(row(summary)).toMatchObject({ status: "waiting", what: "Waiting in Hold" });
  });
});
