import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { RunEventBody } from "./run-event.ts";
import { summaryOf } from "./summarize.test-helper.ts";

const question = { provider: "gateway", key: "gateway-key", origin: "https://gateway.example.com" };
const asked: RunEventBody = { type: "key-origin.asked", ...question };
const draft: RunEventBody = { type: "state.entered", state: "draft" };

verifies("events.summary-key-origin-asked", () => {
  it("holds a question that has no answer yet", () => {
    expect(summaryOf(draft, asked).keyOriginAsked).toEqual([question]);
  });

  it("keeps the question open through a subagent's model call and a tool call", () => {
    const summary = summaryOf(
      draft,
      asked,
      {
        type: "llm.request",
        agent: "researcher",
        provider: "mock",
        model: "scripted",
        messages: 2,
      },
      { type: "tool.called", agent: "researcher", tool: "search", args: {} },
    );

    expect(summary.keyOriginAsked).toEqual([question]);
  });

  it("closes the question with its answer", () => {
    const summary = summaryOf(draft, asked, {
      type: "key-origin.answered",
      ...question,
      answer: "allowed",
    });

    expect(summary).not.toHaveProperty("keyOriginAsked");
  });

  it("closes only the question its answer is for", () => {
    const other = { ...question, key: "backup-key" };
    const summary = summaryOf(
      draft,
      asked,
      { type: "key-origin.asked", ...other },
      { type: "key-origin.answered", ...other, answer: "not-allowed" },
    );

    expect(summary.keyOriginAsked).toEqual([question]);
  });

  it.each<[string, RunEventBody]>([
    [
      "the step's agent starts again",
      { type: "agent.started", state: "draft", agent: "writer", prompt: "Draft the reply" },
    ],
    [
      "an agent finishes",
      {
        type: "agent.finished",
        state: "draft",
        agent: "researcher",
        parent: "writer",
        output: null,
        error: "Not allowed",
      },
    ],
    ["the run fails", { type: "run.failed", state: "draft", error: "Not allowed" }],
  ])("closes every question once %s without an answer", (_, after) => {
    expect(summaryOf(draft, asked, after)).not.toHaveProperty("keyOriginAsked");
  });

  it("leaves the field out of a run that was never asked", () => {
    expect(summaryOf(draft)).not.toHaveProperty("keyOriginAsked");
  });
});
