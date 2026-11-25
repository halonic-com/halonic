import { verifies } from "@halonicjs/testing-spec";
import { beforeEach, describe, expect, it } from "vitest";
import { agentAda, chatTask, me } from "./acme-data.test-helper.ts";
import {
  connect,
  FakePaperclip,
  type Network,
  sourceId as source,
} from "./fake-paperclip.test-helper.ts";
import { documentLinks, fullAnswerMaxBytes } from "./full-answers.ts";
import { findRequest } from "./requests.ts";

let paperclip: FakePaperclip;
let warnings: string[];
const network: Network = { offline: false };
const chat = `${source}:chat:${chatTask}`;
const answerRoute = `/api/issues/${chatTask}/documents/full-answer`;
const taskRoute = `/api/issues/${chatTask}`;

/** The full answer's text, as Ada wrote it. */
const fullText = "1. Build: passed on all three\n2. Windows installer: unsigned";

/** The chat task's full answer, as Paperclip gives it. */
function fullAnswer(overrides: Record<string, unknown> = {}) {
  return {
    key: "full-answer",
    title: "Release 0.3",
    format: "markdown",
    body: fullText,
    ...overrides,
  };
}

/** The chat's comments, newest first: Ada's reply saying `reply`, after the person's question. */
function comments(reply: string, replyOverrides: Record<string, unknown> = {}) {
  return [
    {
      id: "m2",
      body: reply,
      authorAgentId: agentAda,
      createdAt: "2026-11-24T10:02:00.000Z",
      ...replyOverrides,
    },
    { id: "m1", body: "Is 0.3 ready?", authorUserId: me, createdAt: "2026-11-24T10:01:00.000Z" },
  ];
}

/** Serves Acme with the chat holding `chatComments`, and `answer` as its full answer. */
function serve(chatComments: unknown[], answer: Record<string, unknown> = fullAnswer()) {
  paperclip
    .serveAcme()
    .on("GET", `/api/issues/${chatTask}/comments`, { body: chatComments })
    .on("GET", taskRoute, { body: { id: chatTask, identifier: "ACME-8" } })
    .on("GET", answerRoute, { body: answer });
}

/** How many times the fake saw `GET path`. */
const reads = (path: string) =>
  paperclip.seen.filter((request) => request.method === "GET" && request.path === path).length;

const client = () => connect(paperclip, network, (message) => warnings.push(message));

beforeEach(() => {
  network.offline = false;
  paperclip = new FakePaperclip();
  warnings = [];
});

verifies("paperclip-client.full-answers", () => {
  describe("an agent's reply that links its chat's full answer", () => {
    it("carries it, linked by the task's identifier or its ID", async () => {
      for (const task of ["ACME-8", chatTask]) {
        serve(comments(`0.3 is ready. [Details](/ACME/issues/${task}#document-full-answer)`));
        const [question, reply] = await client().listMessages(chat);
        expect(reply?.fullAnswer).toEqual({
          key: "full-answer",
          title: "Release 0.3",
          markdown: fullText,
        });
        expect(question?.fullAnswer).toBeUndefined();
      }
      expect(warnings).toEqual([]);
    });

    it("costs one read per list, and the task's identifier only once", async () => {
      serve(comments("Done. [Details](/ACME/issues/ACME-8#document-full-answer)"));
      const messaging = client();
      await messaging.listMessages(chat);
      await messaging.listMessages(chat);
      expect(reads(answerRoute)).toBe(2);
      expect(reads(taskRoute)).toBe(1);
    });

    it("costs no read when no agent reply links it", async () => {
      const mine = {
        id: "m0",
        body: "See /ACME/issues/ACME-8#document-full-answer",
        authorUserId: me,
        createdAt: "2026-11-24T10:00:00.000Z",
      };
      serve([...comments("Yes, merged at 13:58."), mine]);
      const messages = await client().listMessages(chat);
      expect(messages.every((message) => message.fullAnswer === undefined)).toBe(true);
      expect(reads(answerRoute)).toBe(0);
      expect(reads(taskRoute)).toBe(0);
    });
  });

  describe("no full answer", () => {
    it("for another task's document, another key or an automatic note", async () => {
      const elsewhere =
        "See /ACME/issues/ACME-7#document-full-answer and /ACME/issues/ACME-8#document-plan";
      serve(comments(elsewhere));
      expect((await client().listMessages(chat))[1]?.fullAnswer).toBeUndefined();
      expect(reads(answerRoute)).toBe(0);
      const receipt = { fastResponseRequestId: "r0000000-0000-4000-8000-000000000001" };
      serve(comments("On it. /ACME/issues/ACME-8#document-full-answer", receipt));
      expect((await client().listMessages(chat))[1]?.fullAnswer).toBeUndefined();
    });

    it(`for one over ${fullAnswerMaxBytes} bytes, one that isn't Markdown, or none at all`, async () => {
      const link = "More: /ACME/issues/ACME-8#document-full-answer";
      serve(comments(link), fullAnswer({ body: "é".repeat(fullAnswerMaxBytes / 2 + 1) }));
      expect((await client().listMessages(chat))[1]?.fullAnswer).toBeUndefined();
      serve(comments(link), fullAnswer({ format: "html" }));
      expect((await client().listMessages(chat))[1]?.fullAnswer).toBeUndefined();
      serve(comments(link));
      paperclip.on("GET", answerRoute, { status: 404, body: { error: "Document not found" } });
      expect((await client().listMessages(chat))[1]?.fullAnswer).toBeUndefined();
      expect(warnings).toEqual([]);
    });

    it("when it can't be read: the messages still list and the failure is reported", async () => {
      serve(comments("Done. /ACME/issues/ACME-8#document-full-answer"));
      paperclip.on("GET", answerRoute, { status: 403, body: { error: "forbidden" } });
      const messages = await client().listMessages(chat);
      expect(messages.map((message) => message.body)).toEqual([
        "Is 0.3 ready?",
        "Done. /ACME/issues/ACME-8#document-full-answer",
      ]);
      expect(messages[1]?.fullAnswer).toBeUndefined();
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain("full answer");
      // Given no `warn`, the provider fails the list rather than drop the failure.
      await expect(connect(paperclip, network).listMessages(chat)).rejects.toThrow();
    });
  });

  it("reads only the full-answer document, no other key and not the list", () => {
    const documents = `/api/issues/${chatTask}/documents`;
    expect(findRequest("GET", `${documents}/full-answer`)).toBe("readFullAnswer");
    expect(findRequest("GET", documents)).toBeUndefined();
    expect(findRequest("GET", `${documents}/plan`)).toBeUndefined();
    expect(findRequest("PUT", `${documents}/full-answer`)).toBeUndefined();
  });

  it("finds each document link in a reply, in order", () => {
    const body =
      "[a](https://p.acme.test/ACME/issues/ACME-8#document-full-answer) /issues/ACME-9#document-plan";
    expect(documentLinks(body)).toEqual([
      { task: "ACME-8", key: "full-answer" },
      { task: "ACME-9", key: "plan" },
    ]);
  });
});
