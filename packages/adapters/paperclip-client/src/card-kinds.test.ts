import type { InboxAnswer, InboxItem } from "@halonicjs/ports";
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

const checkbox = "f0000000-0000-4000-8000-000000000020";
const verdicts = "f0000000-0000-4000-8000-000000000021";
const tasks = "f0000000-0000-4000-8000-000000000022";

/** Invented acme cards: files to clean up, docs to review, tasks to start. */
function listCards(overrides: Readonly<Record<string, Record<string, unknown>>> = {}) {
  const pending = {
    status: "pending",
    createdByAgentId: agentBo,
    createdAt: "2026-11-25T09:00:00.000Z",
  };
  return [
    {
      id: checkbox,
      kind: "request_checkbox_confirmation",
      ...pending,
      payload: {
        version: 1,
        prompt: "Which files should go?",
        options: [
          { id: "draft", label: "Old draft" },
          { id: "export", label: "tmp/export.csv" },
          { id: "notes", label: "notes.txt" },
        ],
        defaultSelectedOptionIds: ["draft"],
        minSelected: 1,
        maxSelected: 2,
        rejectRequiresReason: true,
      },
      ...overrides[checkbox],
    },
    {
      id: verdicts,
      kind: "request_item_verdicts",
      ...pending,
      payload: {
        version: 1,
        prompt: "Review each page.",
        items: [
          { id: "intro", label: "Intro page" },
          { id: "setup", label: "Setup page" },
        ],
        verdicts: ["approve", "reject", "defer"],
      },
      ...overrides[verdicts],
    },
    {
      id: tasks,
      kind: "suggest_tasks",
      ...pending,
      title: "Start the docs work",
      payload: {
        version: 1,
        tasks: [
          { clientKey: "write", title: "Write the guide" },
          { clientKey: "shots", title: "Take screenshots" },
        ],
      },
      ...overrides[tasks],
    },
  ];
}

function serve(overrides: Readonly<Record<string, Record<string, unknown>>> = {}) {
  paperclip
    .serveAcme()
    .on("GET", `/api/issues/${plainTask}/interactions`, { body: listCards(overrides) });
}

function expectSent(path: string, answer: InboxAnswer, body: unknown) {
  return async () => {
    paperclip.on("POST", `/api/issues/${plainTask}/interactions/${path}`, {
      body: { resolvedAt: "2026-11-25T09:10:00.000Z" },
    });
    const id = path.split("/")[0] ?? "";
    const result = await client().answer(card(plainTask, id), answer);
    expect(result).toEqual({ outcome: "answered", answeredAt: "2026-11-25T09:10:00.000Z" });
    expect(paperclip.seen.at(-1)?.body).toEqual(body);
  };
}

const verdictOptions = [
  { id: "approve", label: "Approve" },
  { id: "reject", label: "Reject" },
  { id: "defer", label: "Defer" },
];

verifies("paperclip-client.card-kinds", () => {
  it("maps checkbox, verdict and task cards into questions, with Reject next to them", async () => {
    serve();
    const items = await client().listInboxItems();
    const byId = (id: string) => items.find((item) => item.id === card(plainTask, id));
    expect(byId(checkbox)?.options).toEqual([
      { id: "reject", label: "Reject", noteRequired: true },
    ]);
    expect(byId(checkbox)?.questions).toEqual([
      {
        id: "options",
        prompt: "Which files should go?",
        selection: "multiple",
        required: true,
        options: [
          { id: "draft", label: "Old draft" },
          { id: "export", label: "tmp/export.csv" },
          { id: "notes", label: "notes.txt" },
        ],
        preselected: ["draft"],
      },
    ]);
    expect(byId(verdicts)?.options).toEqual([]);
    expect(byId(tasks)?.options).toEqual([{ id: "reject", label: "Reject" }]);
    expect(byId(verdicts)?.questions).toEqual([
      {
        id: "intro",
        prompt: "Intro page",
        selection: "single",
        required: false,
        options: verdictOptions,
      },
      {
        id: "setup",
        prompt: "Setup page",
        selection: "single",
        required: false,
        options: verdictOptions,
      },
    ]);
    expect(byId(tasks)?.question).toBe("Start the docs work");
    expect(byId(tasks)?.questions).toEqual([
      {
        id: "tasks",
        prompt: "Start the docs work",
        selection: "multiple",
        required: true,
        options: [
          { id: "write", label: "Write the guide" },
          { id: "shots", label: "Take screenshots" },
        ],
      },
    ]);
  });

  it("accepts a checkbox card with the options picked", () => {
    serve();
    const answer = {
      kind: "answers",
      answers: [{ question: "options", options: ["draft", "export"] }],
    } as const;
    return expectSent(`${checkbox}/accept`, answer, { selectedOptionIds: ["draft", "export"] })();
  });

  it("rejects a checkbox card with its reason", () => {
    serve();
    const answer = { kind: "option", option: "reject", note: "Keep the draft" } as const;
    return expectSent(`${checkbox}/reject`, answer, { reason: "Keep the draft" })();
  });

  it("submits the verdicts given so far, with a reason where one is needed", () => {
    serve();
    const answer = {
      kind: "answers",
      answers: [{ question: "setup", options: ["reject"], text: "Add the install step" }],
    } as const;
    return expectSent(`${verdicts}/verdicts`, answer, {
      verdicts: [{ id: "setup", verdict: "reject", reason: "Add the install step" }],
    })();
  });

  it("accepts a task card with the tasks picked, and rejects it with a reason", async () => {
    serve();
    const pick = { kind: "answers", answers: [{ question: "tasks", options: ["write"] }] } as const;
    await expectSent(`${tasks}/accept`, pick, { selectedClientKeys: ["write"] })();
    serve();
    const reject = { kind: "option", option: "reject", note: "Not this week" } as const;
    await expectSent(`${tasks}/reject`, reject, { reason: "Not this week" })();
  });

  it("sends nothing for answers outside the card's limits or without a needed reason", async () => {
    serve();
    const refusals: [string, InboxAnswer][] = [
      [checkbox, { kind: "answers", answers: [{ question: "options", options: [] }] }],
      [
        checkbox,
        {
          kind: "answers",
          answers: [{ question: "options", options: ["draft", "export", "notes"] }],
        },
      ],
      [checkbox, { kind: "option", option: "reject" }],
      [checkbox, { kind: "reply", text: "Later" }],
      [verdicts, { kind: "answers", answers: [{ question: "intro", options: ["reject"] }] }],
      [verdicts, { kind: "answers", answers: [] }],
      [verdicts, { kind: "option", option: "reject", note: "No" }],
      [tasks, { kind: "answers", answers: [{ question: "tasks", options: ["unknown"] }] }],
    ];
    for (const [id, answer] of refusals) {
      await expect(client().answer(card(plainTask, id), answer)).rejects.toThrow(
        "doesn't fit the card",
      );
    }
    expect(paperclip.seen.some((request) => request.method === "POST")).toBe(false);
  });

  it("leaves out the items a partial submit resolved, and reads answered cards back", async () => {
    const resolved = { resolvedByUserId: me, resolvedAt: "2026-11-25T09:20:00.000Z" };
    serve({
      [verdicts]: {
        result: { version: 1, complete: false, items: [{ id: "intro", verdict: "approve" }] },
      },
      [checkbox]: { status: "accepted", ...resolved, result: { selectedOptionIds: ["export"] } },
      [tasks]: { status: "rejected", ...resolved, result: { reason: "Not this week" } },
    });
    const items = await client().listInboxItems();
    const byId = (id: string) => items.find((item) => item.id === card(plainTask, id));
    expect(byId(verdicts)?.questions?.map((question) => question.id)).toEqual(["setup"]);
    expect(byId(checkbox)?.state).toEqual({
      kind: "answered",
      by: { kind: "me" },
      answeredAt: "2026-11-25T09:20:00.000Z",
      answer: { kind: "answers", answers: [{ question: "options", options: ["export"] }] },
    });
    expect(byId(tasks)?.state).toMatchObject({
      answer: { kind: "option", option: "reject", note: "Not this week" },
    });
  });

  it("keeps every item of an answered verdict card, so its record names each one", async () => {
    const items = [
      { id: "intro", verdict: "approve" },
      { id: "setup", verdict: "defer" },
    ];
    serve({ [verdicts]: { status: "answered", resolvedByUserId: me, result: { items } } });
    const listed = await client().listInboxItems();
    const answered = listed.find((item) => item.id === card(plainTask, verdicts));
    expect(answered?.questions?.map((question) => question.id)).toEqual(["intro", "setup"]);
    expect(answered?.state).toMatchObject({
      answer: {
        kind: "answers",
        answers: [
          { question: "intro", options: ["approve"] },
          { question: "setup", options: ["defer"] },
        ],
      },
    });
  });

  it("links a kind Halonic can't answer to its task's page, with nothing to answer", async () => {
    const unknown = {
      id: "f0000000-0000-4000-8000-000000000023",
      kind: "request_signature",
      status: "pending",
      createdByAgentId: agentBo,
      createdAt: "2026-11-25T09:30:00.000Z",
      payload: { version: 1, prompt: "Sign the launch plan" },
    };
    paperclip
      .serveAcme()
      .on("GET", `/api/issues/${plainTask}/interactions`, { body: [...listCards(), unknown] });
    const items = await client().listInboxItems();
    const item = items.find((each) => each.id === card(plainTask, unknown.id));
    expect(item?.answerElsewhere).toEqual({
      link: "https://paperclip.acme.test/ACME/issues/ACME-7",
    });
    expect(item?.options).toEqual([]);
    expect(item?.questions).toBeUndefined();
    expect(byKind(items, checkbox)?.answerElsewhere).toBeUndefined();
  });

  it("leaves out a card that doesn't hold together, such as a default it doesn't offer", async () => {
    const payload = { ...(listCards()[0]?.payload ?? {}), defaultSelectedOptionIds: ["gone"] };
    serve({ [checkbox]: { payload } });
    const items = await client().listInboxItems();
    expect(byKind(items, checkbox)).toBeUndefined();
    expect(byKind(items, verdicts)).toBeDefined();
  });
});

function byKind(items: readonly InboxItem[], id: string): InboxItem | undefined {
  return items.find((item) => item.id === card(plainTask, id));
}
