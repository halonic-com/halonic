import { verifies } from "@halonicjs/testing-spec";
import { beforeEach, describe, expect, it } from "vitest";
import {
  acmeData,
  approvalId,
  chatTask,
  confirmCard,
  me,
  plainTask,
  questionCard,
} from "./acme-data.test-helper.ts";
import {
  cardId as card,
  connect,
  FakePaperclip,
  type Network,
  testNow as now,
  sourceId as source,
} from "./fake-paperclip.test-helper.ts";

let paperclip: FakePaperclip;
const network: Network = { offline: false };

beforeEach(() => {
  network.offline = false;
  paperclip = new FakePaperclip();
});

const client = () => connect(paperclip, network);

/** The requests the fake saw, as `METHOD path`. */
const seenRoutes = () => paperclip.seen.map((request) => `${request.method} ${request.path}`);

verifies("ports.agent-messaging", () => {
  describe("writes", () => {
    it("answers a card through its own task's route", async () => {
      paperclip
        .serveAcme()
        .on("POST", `/api/issues/${plainTask}/interactions/${confirmCard}/reject`, {
          body: { resolvedAt: "2026-11-24T10:11:00.000Z" },
        });
      const result = await client().answer(card(plainTask, confirmCard), {
        kind: "option",
        option: "reject",
        note: "Monday",
      });
      expect(result).toEqual({ outcome: "answered", answeredAt: "2026-11-24T10:11:00.000Z" });
      expect(paperclip.seen.at(-1)?.body).toEqual({ reason: "Monday" });
    });

    it("answers a question card with the chosen option", async () => {
      paperclip
        .serveAcme()
        .on("POST", `/api/issues/${plainTask}/interactions/${questionCard}/respond`, { body: {} });
      const result = await client().answer(card(plainTask, questionCard), {
        kind: "option",
        option: "red",
      });
      expect(result).toEqual({ outcome: "answered", answeredAt: now.toISOString() });
      expect(paperclip.seen.at(-1)?.body).toEqual({
        answers: [{ questionId: "q1", optionIds: ["red"] }],
      });
    });

    it("says already-answered, with who and when, when someone answered first", async () => {
      const data = acmeData();
      paperclip
        .serveAcme(data)
        .on("POST", `/api/issues/${plainTask}/interactions/${confirmCard}/accept`, () => {
          const [first] = data.cards;
          Object.assign(first ?? {}, {
            status: "accepted",
            resolvedByUserId: me,
            resolvedAt: "2026-11-24T10:10:30.000Z",
          });
          return {
            status: 409,
            body: {
              error: "Interaction has already been resolved",
              code: "interaction_already_resolved",
            },
          };
        });
      const messaging = client();
      const answer = { kind: "option", option: "accept" } as const;
      const expected = {
        outcome: "already-answered",
        by: { kind: "me" },
        answeredAt: "2026-11-24T10:10:30.000Z",
      };
      expect(await messaging.answer(card(plainTask, confirmCard), answer)).toEqual(expected);
      paperclip.seen.length = 0;
      expect(await messaging.answer(card(plainTask, confirmCard), answer)).toEqual(expected);
      expect(seenRoutes()).toEqual([`GET /api/issues/${plainTask}/interactions`]);
    });

    it("refuses an action-result answer with bad-answer and sends nothing", async () => {
      paperclip.serveAcme();
      const result = await client().answer(card(plainTask, confirmCard), {
        kind: "action-result",
        outcome: "declined",
        steps: [],
      });
      expect(result).toEqual({ outcome: "refused", reason: "bad-answer" });
      expect(paperclip.seen).toEqual([]);
    });

    it("answers an approval, and says already-answered when it was decided", async () => {
      paperclip
        .on("POST", `/api/approvals/${approvalId}/approve`, {
          status: 422,
          body: { error: "Only pending" },
        })
        .on("GET", `/api/approvals/${approvalId}`, {
          body: {
            id: approvalId,
            status: "approved",
            decidedByUserId: "u-other",
            decidedAt: "2026-11-24T10:00:00.000Z",
          },
        });
      expect(
        await client().answer(`${source}:approval:${approvalId}`, {
          kind: "option",
          option: "approve",
        }),
      ).toEqual({
        outcome: "already-answered",
        by: { kind: "person", name: "Board" },
        answeredAt: "2026-11-24T10:00:00.000Z",
      });
    });

    it("refuses a write offline and never sends it later", async () => {
      paperclip.serveAcme();
      const messaging = client();
      network.offline = true;
      expect(
        await messaging.answer(card(plainTask, confirmCard), { kind: "option", option: "accept" }),
      ).toEqual({
        outcome: "refused",
        reason: "offline",
      });
      expect(await messaging.send(`${source}:chat:${chatTask}`, "hi")).toEqual({
        outcome: "refused",
        reason: "offline",
      });
      network.offline = false;
      await messaging.refresh();
      expect(paperclip.seen.filter((request) => request.method === "POST")).toEqual([]);
    });

    it("sends a message to a chat and returns it", async () => {
      paperclip.serveAcme().on("POST", `/api/issues/${chatTask}/comments`, ({ body }) => ({
        body: {
          id: "m3",
          body: (body as { body: string }).body,
          authorUserId: me,
          createdAt: "2026-11-24T10:12:00.000Z",
        },
      }));
      const result = await client().send(`${source}:chat:${chatTask}`, "On it");
      expect(result).toEqual({
        outcome: "sent",
        message: {
          id: `${source}:comment:${chatTask}:m3`,
          conversation: `${source}:chat:${chatTask}`,
          author: { kind: "me" },
          body: "On it",
          sentAt: "2026-11-24T10:12:00.000Z",
          attachments: [],
        },
      });
      expect(paperclip.seen.at(-1)?.body).toMatchObject({
        body: "On it",
        clientRequestId: expect.any(String),
      });
    });

    it("sends nothing to a task that isn't one of the person's chats", async () => {
      paperclip.serveAcme();
      expect(await client().send(`${source}:chat:${plainTask}`, "hi")).toEqual({
        outcome: "refused",
        reason: "not-found",
      });
      expect(paperclip.seen.filter((request) => request.method === "POST")).toEqual([]);
    });

    it("has no channels, and sends nothing addressed to an agent outside the chat", async () => {
      paperclip.serveAcme();
      const messaging = client();
      const chat = `${source}:chat:${chatTask}`;
      const notSupported = { outcome: "refused", reason: "not-supported" };
      expect(await messaging.startChannel("Launch", [], "")).toEqual(notSupported);
      expect(await messaging.setMembers(chat, [], "")).toEqual(notSupported);
      expect(await messaging.joinChannel(chat)).toEqual(notSupported);
      expect(await messaging.leaveChannel(chat)).toEqual(notSupported);
      expect(await messaging.browseChannels()).toEqual([]);
      expect(await messaging.send(chat, "hi", [], { to: [`${source}:agent:someone`] })).toEqual({
        outcome: "refused",
        reason: "not-found",
      });
      expect(paperclip.seen.filter((request) => request.method === "POST")).toEqual([]);
    });

    it("refuses a write to a task Paperclip doesn't know or after sign-out", async () => {
      paperclip
        .serveAcme()
        .on("POST", `/api/issues/${chatTask}/comments`, { status: 401, body: {} });
      expect(await client().send(`${source}:chat:${chatTask}`, "hi")).toEqual({
        outcome: "refused",
        reason: "signed-out",
      });
      expect(
        await client().answer(card(plainTask, confirmCard), { kind: "option", option: "accept" }),
      ).toEqual({
        outcome: "refused",
        reason: "not-found",
      });
    });
  });

  it("says which source changed when a poll finds something new", async () => {
    const data = acmeData();
    paperclip.serveAcme(data);
    const messaging = client();
    const reader = messaging.changes()[Symbol.asyncIterator]();
    await messaging.refresh();
    await messaging.refresh();
    const [task] = data.tasks;
    if (task !== undefined) {
      task.title = "Pick a launch week";
    }
    await messaging.refresh();
    expect(await reader.next()).toEqual({ done: false, value: source });
    await reader.return?.();
  });
});
