import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { answerFitsItem, type InboxItem, type InboxQuestionAnswer } from "./index.ts";

const plain: InboxItem = {
  id: "acme:item:1",
  source: "acme",
  from: { kind: "agent", agent: "acme:ada", name: "Ada" },
  question: "Three open decisions",
  options: [
    { id: "yes", label: "Yes" },
    { id: "no", label: "No" },
  ],
  attachments: [],
  createdAt: "2026-11-24T10:00:00Z",
  state: { kind: "open" },
};

const asking: InboxItem = {
  ...plain,
  options: [],
  questions: [
    {
      id: "repo",
      prompt: "Where does the code live?",
      selection: "single",
      required: true,
      options: [
        { id: "separate", label: "A separate repo" },
        { id: "mono", label: "The monorepo" },
      ],
    },
    {
      id: "phase",
      prompt: "What goes into phase 2?",
      selection: "multiple",
      required: false,
      options: [
        { id: "tests", label: "Tests" },
        { id: "docs", label: "Docs" },
      ],
    },
  ],
};

function answers(...each: InboxQuestionAnswer[]) {
  return { kind: "answers", answers: each } as const;
}

verifies("ports.agent-messaging-questions", () => {
  it("takes an answer for each question, several options for a multiple-select one", () => {
    const both = answers(
      { question: "repo", options: ["separate"] },
      { question: "phase", options: ["tests", "docs"] },
    );

    expect(answerFitsItem(asking, both)).toBe(true);
    expect(answerFitsItem(asking, answers({ question: "repo", options: ["mono"] }))).toBe(true);
  });

  it("refuses a required question left out, or answered with nothing", () => {
    expect(answerFitsItem(asking, answers({ question: "phase", options: ["tests"] }))).toBe(false);
    expect(answerFitsItem(asking, answers({ question: "repo", options: [] }))).toBe(false);
  });

  it("refuses two options for a single-select question, or one picked twice", () => {
    const two = answers({ question: "repo", options: ["separate", "mono"] });
    const twice = answers(
      { question: "repo", options: ["mono"] },
      { question: "phase", options: ["docs", "docs"] },
    );

    expect(answerFitsItem(asking, two)).toBe(false);
    expect(answerFitsItem(asking, twice)).toBe(false);
  });

  it("refuses a question named twice, a question not asked, or an option not offered", () => {
    const repeated = answers(
      { question: "repo", options: ["mono"] },
      { question: "repo", options: ["mono"] },
    );
    const unknown = answers(
      { question: "repo", options: ["mono"] },
      { question: "colour", options: ["blue"] },
    );
    const notOffered = answers({ question: "repo", options: ["elsewhere"] });

    expect(answerFitsItem(asking, repeated)).toBe(false);
    expect(answerFitsItem(asking, unknown)).toBe(false);
    expect(answerFitsItem(asking, notOffered)).toBe(false);
  });

  it("takes only answers for an item with questions, and never for one without", () => {
    expect(answerFitsItem(asking, { kind: "option", option: "separate" })).toBe(false);
    expect(answerFitsItem(asking, { kind: "reply", text: "Later" })).toBe(false);
    expect(answerFitsItem(plain, answers({ question: "repo", options: ["mono"] }))).toBe(false);
    expect(answerFitsItem(plain, { kind: "option", option: "yes" })).toBe(true);
  });

  it("takes only an action-result for an item with both an action and questions", () => {
    const action = {
      definition: "acme.invite",
      version: 1,
      parameters: {},
      expires: "2026-11-25T10:00:00Z",
    };
    const both: InboxItem = { ...asking, action };
    const declined = { kind: "action-result", outcome: "declined", steps: [] } as const;
    expect(answerFitsItem(both, declined)).toBe(true);
    expect(answerFitsItem(both, answers({ question: "repo", options: ["mono"] }))).toBe(false);
  });
});
