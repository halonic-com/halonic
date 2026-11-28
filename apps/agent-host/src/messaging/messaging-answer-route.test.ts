import type { AnswerResult, InboxAnswer, InboxItem } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Desktop, startDesktop } from "./desktop-messaging.test-helper.ts";

let desktop: Desktop | undefined;

afterEach(async () => {
  await desktop?.close();
  desktop = undefined;
});

const answered: AnswerResult = { outcome: "answered", answeredAt: "2026-11-24T14:00:00.000Z" };

/** A normal card the workspace lists, which every answer goes to. */
const card: InboxItem = {
  id: "card-1",
  source: "paperclip:halonic",
  from: { kind: "agent", agent: "paperclip:halonic:agent:ada", name: "Ada" },
  question: "Which repo layout?",
  options: [],
  attachments: [],
  createdAt: "2026-11-24T13:00:00.000Z",
  state: { kind: "open" },
};

/** The desktop, with its workspace listing the card and its `answer` replaced by a spy that answers it. */
async function withAnswerSpy() {
  desktop = await startDesktop();
  const workspace = await desktop.messaging.of(desktop.workspace);
  if (workspace === undefined) throw new Error("The helper's workspace isn't served.");
  vi.spyOn(workspace.messaging, "listInboxItems").mockResolvedValue([card]);
  const answer = vi.spyOn(workspace.messaging, "answer").mockResolvedValue(answered);
  return {
    studio: desktop.studio,
    transport: desktop.transport,
    workspace: desktop.workspace,
    answer,
  };
}

/** One answer of each kind Studio's cards send, as Studio sends it. */
const cardAnswers: Record<string, InboxAnswer> = {
  "an option (yes/no, approval, decision)": { kind: "option", option: "approve" },
  "an option with a note (reject with a reason, request changes)": {
    kind: "option",
    option: "reject",
    note: "The acme budget is too high.",
  },
  "a reply": { kind: "reply", text: "Paint it blue." },
  "the answers to a question card": {
    kind: "answers",
    answers: [
      { question: "repo", options: ["mono"] },
      { question: "extras", options: ["docs", "tests"], text: "and a changelog" },
    ],
  },
  "a checkbox card's picks": { kind: "answers", answers: [{ question: "options", options: [] }] },
  "a declined stepper": { kind: "action-result", outcome: "declined", steps: [] },
};

verifies("agent-host.messaging-answer-route", () => {
  describe("passes every answer Studio's cards send on to the workspace's messaging", () => {
    for (const [name, answer] of Object.entries(cardAnswers)) {
      it(name, async () => {
        const on = await withAnswerSpy();

        const result = await on.studio.answer("card-1", answer);

        expect(result).toEqual(answered);
        expect(on.answer).toHaveBeenCalledExactlyOnceWith("card-1", answer);
      });
    }
  });

  it("refuses an answer of another shape with bad-answer, asking no source", async () => {
    const on = await withAnswerSpy();

    const reply = await on.transport.request("POST /v1/messaging/answer", {
      workspace: on.workspace,
      item: "card-1",
      answer: { kind: "everything", option: "approve" },
    });

    expect(reply).toEqual({
      status: 200,
      body: { result: { outcome: "refused", reason: "bad-answer" } },
    });
    expect(on.answer).not.toHaveBeenCalled();
  });
});
