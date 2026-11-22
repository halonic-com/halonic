import type { RunEventBody } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { agentSays } from "./receipt-model.ts";
import { rejectedAfterAgentSaid } from "./run-ending.ts";
import { logOf } from "./run-log.test-helper.ts";

// Kept apart from receipt-model.test.ts, which is near the file-size limit.
const id = "run_mfx3k2a1_01jd8q";

const saved = (name: string): RunEventBody => ({
  type: "artifact.created",
  state: "write",
  name,
  hash: "a".repeat(64),
  mediaType: "text/markdown",
  size: 12,
});

const answered = (output: unknown, error?: string): RunEventBody => ({
  type: "agent.finished",
  state: "write",
  agent: "reporter",
  output,
  ...(error === undefined ? {} : { error }),
});

const logWith = (...bodies: RunEventBody[]) =>
  logOf(
    id,
    bodies.map((body) => [1, body] as const),
  );

verifies("runs.run-view.agent-says", () => {
  it("gives the last answer, as written with its line breaks", () => {
    expect(
      agentSays(logWith(answered("Sorted"), answered("This week: 12 emails.\nAll answered."))),
    ).toBe("This week: 12 emails.\nAll answered.");
  });

  it("gives an answer that isn't text as its JSON", () => {
    expect(agentSays(logWith(answered({ emails: 12 })))).toBe('{\n  "emails": 12\n}');
  });

  it("passes over a failed or empty answer for the one before it", () => {
    expect(agentSays(logWith(answered("Sorted as refund"), answered(null, "Model refused")))).toBe(
      "Sorted as refund",
    );
    expect(agentSays(logWith(answered("Sorted as refund"), answered("  ")))).toBe(
      "Sorted as refund",
    );
  });

  it("escapes hidden characters and keeps Markdown as text", () => {
    const text = `Pay ${String.fromCodePoint(0x202e)}![x](https://example.com/x.png)`;
    expect(agentSays(logWith(answered(text)))).toBe("Pay \\u202e![x](https://example.com/x.png)");
  });

  it("is undefined when no agent answered", () => {
    expect(agentSays(logWith(saved("a.md")))).toBeUndefined();
  });
});

verifies("runs.run-view.agent-says", () => {
  const received = (event: string): RunEventBody => ({ type: "event.received", event });
  const resolved = (approved: boolean, by?: "person" | "rule"): RunEventBody => ({
    type: "approval.resolved",
    state: "draft",
    agent: "drafter",
    tool: "gmail_send",
    callId: "c1",
    approved,
    ...(by === undefined ? {} : { by }),
  });
  const draft = answered("Sorry your order arrived damaged, Sam.");

  it("says you rejected the words when a wait step was answered reject after them (HAL-14586)", () => {
    expect(rejectedAfterAgentSaid(logWith(draft, received("reject")))).toBe("you");
  });

  it("says a rule rejected them when a rule turned down a tool call after them", () => {
    expect(rejectedAfterAgentSaid(logWith(draft, resolved(false, "rule")))).toBe("rule");
    expect(rejectedAfterAgentSaid(logWith(draft, resolved(false)))).toBe("you");
  });

  it("keeps the normal heading after an approval, or when an agent answered after the rejection", () => {
    expect(rejectedAfterAgentSaid(logWith(draft, received("approve")))).toBeUndefined();
    expect(rejectedAfterAgentSaid(logWith(draft, resolved(true, "person")))).toBeUndefined();
    expect(
      rejectedAfterAgentSaid(logWith(draft, received("reject"), answered("A new draft."))),
    ).toBeUndefined();
  });

  it("passes over a failed answer after the rejection, as the frame does", () => {
    expect(
      rejectedAfterAgentSaid(logWith(draft, received("reject"), answered(null, "Model refused"))),
    ).toBe("you");
  });

  it("is undefined when no agent answered", () => {
    expect(rejectedAfterAgentSaid(logWith(received("reject")))).toBeUndefined();
  });
});
