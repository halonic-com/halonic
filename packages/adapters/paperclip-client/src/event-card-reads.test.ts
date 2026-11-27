import { verifies } from "@halonicjs/testing-spec";
import { beforeEach, describe, expect, it } from "vitest";
import { acmeData, company, confirmCard, me, plainTask, testKey } from "./acme-data.test-helper.ts";
import { PaperclipMessaging } from "./client.ts";
import { cardId as card, FakePaperclip, testNow } from "./fake-paperclip.test-helper.ts";
import type { LiveEvent } from "./live-messages.ts";
import { LiveTaskChanges } from "./live-task-changes.ts";

let paperclip: FakePaperclip;
let data: ReturnType<typeof acmeData>;
let liveTasks: LiveTaskChanges;

/** The plain task's card, before Paperclip has moved the task's `updatedAt` for it. */
const newCard = card(plainTask, confirmCard);

beforeEach(() => {
  paperclip = new FakePaperclip();
  data = acmeData();
  data.cards = [];
  paperclip.serveAcme(data);
  liveTasks = new LiveTaskChanges();
});

const client = () =>
  new PaperclipMessaging({
    address: paperclip.address,
    key: testKey,
    connection: "acme",
    company,
    label: "Paperclip · Acme",
    userId: me,
    now: () => testNow,
    fetch: paperclip.fetch,
    liveTasks,
  });

/** The event Paperclip sends for `action` on `entityType` `entityId`. */
function activity(action: string, entityType: string, entityId: string): LiveEvent {
  return { kind: "activity", action, entityType, entityId, createdAt: testNow.toISOString() };
}

/** The ids of the Inbox's items. */
async function inboxOf(messaging: PaperclipMessaging): Promise<string[]> {
  return (await messaging.listInboxItems()).map((item) => item.id);
}

/** Paperclip moves the plain task's `updatedAt`, as it does just after it sent the card's event. */
function touchPlainTask(): void {
  const task = data.tasks.find((each) => each.id === plainTask);
  if (task !== undefined) task.updatedAt = "2026-11-24T10:09:30.000Z";
}

verifies("paperclip-client.event-card-reads", () => {
  describe("a live event that names a task reads its cards again", () => {
    it("lists a new card whose event came before Paperclip moved the task's updatedAt (HAL-20614)", async () => {
      const messaging = client();
      expect(await inboxOf(messaging)).not.toContain(newCard);
      data.cards = acmeData().cards;
      liveTasks.heard(activity("issue.thread_interaction_created", "issue", plainTask));

      expect(await inboxOf(messaging)).toContain(newCard);
      touchPlainTask();
      expect(await inboxOf(messaging)).toContain(newCard);
    });

    it("without an event, keeps a task's cards until its updatedAt moves", async () => {
      const messaging = client();
      await messaging.listInboxItems();
      data.cards = acmeData().cards;
      expect(await inboxOf(messaging)).not.toContain(newCard);
      touchPlainTask();
      expect(await inboxOf(messaging)).toContain(newCard);
    });

    it("reads a named task's cards once, then again only on its next event", async () => {
      const messaging = client();
      await messaging.listInboxItems();
      liveTasks.heard(activity("issue.comment_added", "issue", plainTask));
      const cardReads = () =>
        paperclip.seen.filter(
          (request) => request.path === `/api/issues/${plainTask}/interactions`,
        );
      paperclip.seen.length = 0;
      await messaging.listInboxItems();
      await messaging.listInboxItems();
      expect(cardReads()).toHaveLength(1);
    });

    it("names the task again when the read of its cards fails, so the next list reads them", async () => {
      const messaging = client();
      await messaging.listInboxItems();
      data.cards = acmeData().cards;
      liveTasks.heard(activity("issue.thread_interaction_created", "issue", plainTask));
      paperclip.on("GET", `/api/issues/${plainTask}/interactions`, { status: 500, body: {} });
      await expect(messaging.listInboxItems()).rejects.toThrow();

      paperclip.on("GET", `/api/issues/${plainTask}/interactions`, () => ({ body: data.cards }));
      expect(await inboxOf(messaging)).toContain(newCard);
    });

    it("names no task for an event on an approval, an agent or anything but an activity", () => {
      liveTasks.heard(activity("approval.created", "approval", plainTask));
      liveTasks.heard(activity("agent.updated", "agent", plainTask));
      liveTasks.heard({ kind: "other", type: "heartbeat.run.status", createdAt: "" });
      expect([...liveTasks.take()]).toEqual([]);
    });
  });
});
