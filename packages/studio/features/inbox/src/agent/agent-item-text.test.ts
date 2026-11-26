import type { InboxItem } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { agentItemBody, answerText } from "./agent-item-text.ts";

const asking: InboxItem = {
  id: "acme:item:1",
  source: "acme",
  from: { kind: "agent", agent: "acme:ada", name: "Ada" },
  question: "Two open decisions",
  options: [],
  questions: [
    {
      id: "phase",
      prompt: "What goes into phase 2?",
      selection: "multiple",
      required: true,
      options: [
        { id: "tests", label: "Tests" },
        { id: "docs", label: "Docs" },
      ],
    },
  ],
  attachments: [],
  createdAt: "2026-11-24T10:00:00Z",
  state: { kind: "open" },
};

verifies("inbox.agent-inbox-items", () => {
  it("says the labels picked for an item's questions, and an unknown option by its ID", () => {
    const text = answerText(asking, {
      kind: "answers",
      answers: [{ question: "phase", options: ["docs", "later"] }],
    });

    expect(text).toBe("Docs, later");
  });

  it("leaves the title's line out of the body, and keeps a first line with a link", () => {
    const body = (question: string) => agentItemBody({ ...asking, question });

    expect(body("New secret: ACME_TOKEN\n\n- Key: ACME_TOKEN")).toBe("- Key: ACME_TOKEN");
    expect(body("# **Hire** an agent\n\nIris, designer")).toBe("Iris, designer");
    expect(body("Two open decisions")).toBe("");
    const linked = "Read [the plan](https://acme.example/plan)\n\nThen answer.";
    expect(body(linked)).toBe(linked);
  });
});
