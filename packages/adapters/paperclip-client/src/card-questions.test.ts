import type { InboxAnswer } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { beforeEach, expect, it } from "vitest";
import { agentBo, me, plainTask } from "./acme-data.test-helper.ts";
import {
  cardId as card,
  connect,
  FakePaperclip,
  type Network,
} from "./fake-paperclip.test-helper.ts";

let paperclip: FakePaperclip;
const network: Network = { offline: false };

beforeEach(() => {
  network.offline = false;
  paperclip = new FakePaperclip();
});

const client = () => connect(paperclip, network);

const threeQuestions = "f0000000-0000-4000-8000-000000000010";
const multipleOnly = "f0000000-0000-4000-8000-000000000011";

/** An invented plan card: two single-select questions and one multiple-select, optional one. */
const planQuestions = [
  {
    id: "repo",
    prompt: "Where does the code live?",
    selectionMode: "single",
    options: [
      { id: "separate", label: "A separate repo" },
      { id: "mono", label: "The monorepo" },
    ],
  },
  {
    id: "phase",
    prompt: "What goes into phase 2?",
    selectionMode: "multiple",
    required: false,
    options: [
      { id: "tests", label: "Tests" },
      { id: "docs", label: "Docs" },
    ],
  },
  {
    id: "owner",
    prompt: "Who owns it?",
    selectionMode: "single",
    required: true,
    options: [{ id: "ada", label: "Ada" }],
  },
];

function questionCards(answered: boolean) {
  const resolved = {
    status: "answered",
    resolvedByUserId: me,
    resolvedAt: "2026-11-24T10:05:00.000Z",
    result: {
      version: 1,
      answers: [
        { questionId: "repo", optionIds: ["mono"] },
        { questionId: "phase", optionIds: ["tests", "docs"], otherText: "And a demo" },
        { questionId: "owner", optionIds: ["ada"] },
      ],
    },
  };
  return [
    {
      id: threeQuestions,
      kind: "ask_user_questions",
      createdByAgentId: agentBo,
      payload: { version: 1, questions: planQuestions },
      createdAt: "2026-11-24T10:00:00.000Z",
      ...(answered ? resolved : { status: "pending" }),
    },
    {
      id: multipleOnly,
      kind: "ask_user_questions",
      status: "pending",
      createdByAgentId: agentBo,
      payload: { version: 1, questions: [planQuestions[1]] },
      createdAt: "2026-11-24T09:59:00.000Z",
    },
  ];
}

function serve(answered = false) {
  paperclip
    .serveAcme()
    .on("GET", `/api/issues/${plainTask}/interactions`, { body: questionCards(answered) });
}

const planAnswer = {
  kind: "answers",
  answers: [
    { question: "repo", options: ["separate"] },
    { question: "phase", options: ["tests", "docs"] },
    { question: "owner", options: ["ada"] },
  ],
} as const;

verifies("paperclip-client.question-cards", () => {
  it("maps a card with several questions, or a multiple-select one, into questions with no options", async () => {
    serve();
    const items = await client().listInboxItems();
    const plan = items.find((item) => item.id === card(plainTask, threeQuestions));
    expect(plan?.options).toEqual([]);
    expect(plan?.questions).toEqual([
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
      {
        id: "owner",
        prompt: "Who owns it?",
        selection: "single",
        required: true,
        options: [{ id: "ada", label: "Ada" }],
      },
    ]);
    const single = items.find((item) => item.id === card(plainTask, multipleOnly));
    expect(single?.options).toEqual([]);
    expect(single?.questions?.map((question) => question.selection)).toEqual(["multiple"]);
  });

  it("answers every question in one respondToCard request", async () => {
    serve();
    paperclip.on("POST", `/api/issues/${plainTask}/interactions/${threeQuestions}/respond`, {
      body: { resolvedAt: "2026-11-24T10:11:00.000Z" },
    });
    const result = await client().answer(card(plainTask, threeQuestions), planAnswer);
    expect(result).toEqual({ outcome: "answered", answeredAt: "2026-11-24T10:11:00.000Z" });
    expect(paperclip.seen.at(-1)?.body).toEqual({
      answers: [
        { questionId: "repo", optionIds: ["separate"] },
        { questionId: "phase", optionIds: ["tests", "docs"] },
        { questionId: "owner", optionIds: ["ada"] },
      ],
    });
  });

  it("sends nothing for an option, a reply or answers that don't fit the questions", async () => {
    serve();
    const target = card(plainTask, threeQuestions);
    const refusedAnswers: InboxAnswer[] = [
      { kind: "option", option: "mono" },
      { kind: "reply", text: "Later" },
      { kind: "answers", answers: [{ question: "repo", options: ["mono"] }] },
    ];
    for (const answer of refusedAnswers) {
      await expect(client().answer(target, answer)).rejects.toThrow("doesn't fit the card");
    }
    expect(paperclip.seen.some((request) => request.method === "POST")).toBe(false);
  });

  it("reads an answered card back as an answers answer with every question's options", async () => {
    serve(true);
    const items = await client().listInboxItems();
    const plan = items.find((item) => item.id === card(plainTask, threeQuestions));
    expect(plan?.state).toEqual({
      kind: "answered",
      by: { kind: "me" },
      answeredAt: "2026-11-24T10:05:00.000Z",
      answer: {
        kind: "answers",
        answers: [
          { question: "repo", options: ["mono"] },
          { question: "phase", options: ["tests", "docs"], text: "And a demo" },
          { question: "owner", options: ["ada"] },
        ],
      },
    });
  });
});
