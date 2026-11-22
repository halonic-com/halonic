import { type RunEventBody, summarize } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { mondayMorning } from "../summary.test-helper.ts";
import { everyStep } from "./every-step-model.ts";
import { entered, logOf } from "./run-log.test-helper.ts";

const question = { provider: "gateway", key: "gateway-key", origin: "https://gateway.example.com" };
const asked: RunEventBody = { type: "key-origin.asked", ...question };

/** The run's last step, as the run page shows it at 10:40, for a run that drafts and then logs `after`. */
function draftAfter(...after: RunEventBody[]) {
  const events = logOf("run_a_01jd8q", [
    [0, entered("read")],
    [1, entered("draft")],
    ...after.map((body) => [1, body] as const),
  ]);
  const summary = summarize(events);
  if (summary === null) throw new Error("The test log has no run.started.");
  return everyStep(events, summary, undefined, mondayMorning).at(-1);
}

verifies("runs.run-view.key-origin-waiting", () => {
  it("shows that the step waits for the person's answer while the question is open", () => {
    const draft = draftAfter(asked);

    expect(draft).toMatchObject({ mark: "needs-you", line: "Waiting for your answer" });
    expect(draft?.label).toBe("Draft, waiting for you, 10:41, Waiting for your answer");
  });

  it("goes back to running once the answer follows", () => {
    const draft = draftAfter(asked, {
      type: "key-origin.answered",
      ...question,
      answer: "allowed",
    });

    expect(draft).toMatchObject({ mark: "running", line: "Running" });
  });

  it("keeps showing the wait when another event comes while the question is open", () => {
    const draft = draftAfter(
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

    expect(draft).toMatchObject({ mark: "needs-you", line: "Waiting for your answer" });
  });

  it("keeps showing the wait until the answer for that key and address", () => {
    const other = { ...question, key: "backup-key" };
    const draft = draftAfter(
      asked,
      { type: "key-origin.asked", ...other },
      {
        type: "key-origin.answered",
        ...other,
        answer: "allowed",
      },
    );

    expect(draft).toMatchObject({ mark: "needs-you", line: "Waiting for your answer" });
  });

  it("shows no wait once the step's agent starts again after a wait without an answer", () => {
    const draft = draftAfter(asked, {
      type: "agent.started",
      state: "draft",
      agent: "writer",
      prompt: "Draft the reply",
    });

    expect(draft).toMatchObject({ mark: "running", line: "Running" });
  });

  it("shows no wait once an agent finished after a wait without an answer", () => {
    const draft = draftAfter(asked, {
      type: "agent.finished",
      state: "draft",
      agent: "researcher",
      parent: "writer",
      output: null,
      error: "Not allowed",
    });

    expect(draft).toMatchObject({ mark: "running", line: "Running" });
  });

  it("shows no wait once the run has ended", () => {
    const draft = draftAfter(asked, { type: "run.failed", state: "draft", error: "Not allowed" });

    expect(draft?.mark).toBe("failed");
  });
});
