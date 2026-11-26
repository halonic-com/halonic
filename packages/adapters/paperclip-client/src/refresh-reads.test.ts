import { verifies } from "@halonicjs/testing-spec";
import { beforeEach, describe, expect, it } from "vitest";
import { chatTask, company, me, testKey } from "./acme-data.test-helper.ts";
import { PaperclipMessaging } from "./client.ts";
import { FakePaperclip, testNow } from "./fake-paperclip.test-helper.ts";
import { RefreshReads, refreshListsKeepMs } from "./refresh-reads.ts";

let paperclip: FakePaperclip;
/** The clients' clock, which a test moves on. */
let now: Date;

beforeEach(() => {
  paperclip = new FakePaperclip().serveAcme();
  now = testNow;
});

/** A client for the Acme connection whose clock is {@link now}, sending through `fetch`. */
function client(fetch: typeof paperclip.fetch = paperclip.fetch): PaperclipMessaging {
  return new PaperclipMessaging({
    address: paperclip.address,
    key: testKey,
    connection: "acme",
    company,
    label: "Paperclip · Acme",
    userId: me,
    now: () => now,
    fetch,
  });
}

/** Each request the fake saw, as `METHOD path?query`, with how many times it was sent. */
function requestCounts(): Map<string, number> {
  const counts = new Map<string, number>();
  for (const { method, path, query } of paperclip.seen) {
    const request = `${method} ${path}?${query.toString()}`;
    counts.set(request, (counts.get(request) ?? 0) + 1);
  }
  return counts;
}

/** How many times the open tasks were read, whole or as changes; a search (`q=`) doesn't count. */
const taskReads = () =>
  paperclip.seen.filter(
    ({ method, path, query }) =>
      method === "GET" && path === `/api/companies/${company}/issues` && !query.has("q"),
  ).length;

/** The server's poll loop: one `refresh`, then its six lists, read at once. */
async function poll(messaging: PaperclipMessaging): Promise<void> {
  await messaging.refresh();
  await Promise.all([
    messaging.listSources(),
    messaging.listAgents(),
    messaging.listConversations(),
    messaging.listInboxItems(),
    messaging.listWork(),
    messaging.browseChannels(),
  ]);
}

verifies("paperclip-client.refresh-reads", () => {
  describe("list reads right after a refresh", () => {
    it("send each Paperclip request of a poll once, on the first poll and the next", async () => {
      const messaging = client();
      await poll(messaging);
      const first = requestCounts();
      expect(first.size).toBeGreaterThan(5);
      expect([...first].filter(([, count]) => count > 1)).toEqual([]);
      paperclip.seen.length = 0;
      await poll(messaging);
      expect([...requestCounts()].filter(([, count]) => count > 1)).toEqual([]);
      expect(taskReads()).toBe(1);
    });

    it("answer as reading Paperclip does", async () => {
      const messaging = client();
      await messaging.refresh();
      const kept = [await messaging.listConversations(), await messaging.listWork()];
      expect(kept).toEqual([await messaging.listConversations(), await messaging.listWork()]);
    });

    it("read Paperclip again after a write", async () => {
      paperclip.on("POST", `/api/issues/${chatTask}/comments`, {
        body: { id: "m9", body: "Thanks", authorUserId: me, createdAt: "2026-11-24T10:12:00Z" },
      });
      const messaging = client();
      await messaging.refresh();
      const sent = await messaging.send(`paperclip:acme:chat:${chatTask}`, "Thanks");
      expect(sent.outcome).toBe("sent");
      paperclip.seen.length = 0;
      await messaging.listConversations();
      await messaging.listWork();
      expect(taskReads()).toBe(2);
    });

    it("read Paperclip again after a write that a refresh ran during", async () => {
      paperclip.on("POST", `/api/issues/${chatTask}/comments`, {
        body: { id: "m9", body: "Thanks", authorUserId: me, createdAt: "2026-11-24T10:12:00Z" },
      });
      // Holds the comment's POST until the test lets it through, after the `refresh` read Paperclip.
      let land = () => {};
      const landed = new Promise<void>((resolve) => {
        land = resolve;
      });
      const messaging = client(async (input, init) => {
        if (init?.method === "POST") {
          await landed;
        }
        return paperclip.fetch(input, init);
      });
      const sending = messaging.send(`paperclip:acme:chat:${chatTask}`, "Thanks");
      await messaging.refresh();
      land();
      expect((await sending).outcome).toBe("sent");
      paperclip.seen.length = 0;
      await messaging.listConversations();
      expect(taskReads()).toBe(1);
    });

    it("read Paperclip again for a second read of the same list", async () => {
      const messaging = client();
      await messaging.refresh();
      paperclip.seen.length = 0;
      await messaging.listWork();
      expect(taskReads()).toBe(0);
      await messaging.listWork();
      expect(taskReads()).toBe(1);
    });

    it("read Paperclip again when made later than the keep time", async () => {
      const messaging = client();
      await messaging.refresh();
      paperclip.seen.length = 0;
      now = new Date(testNow.getTime() + refreshListsKeepMs + 1000);
      await messaging.listWork();
      expect(taskReads()).toBe(1);
    });
  });

  describe("RefreshReads", () => {
    const lists = { conversations: [], inboxItems: [], work: [], channels: [] };

    it("keeps nothing from a refresh during which a write started", () => {
      const reads = new RefreshReads(() => testNow);
      const reading = reads.start();
      reads.forget();
      reading.keep(lists);
      expect(reads.take("work")).toBeUndefined();
    });

    it("keeps nothing from a refresh that a later refresh followed", () => {
      const reads = new RefreshReads(() => testNow);
      const earlier = reads.start();
      const later = reads.start();
      earlier.keep({ ...lists, work: [] });
      expect(reads.take("work")).toBeUndefined();
      later.keep(lists);
      expect(reads.take("work")).toEqual([]);
    });

    it("answers no agents when the refresh read none", () => {
      const reads = new RefreshReads(() => testNow);
      reads.start().keep(lists);
      expect(reads.take("agents")).toBeUndefined();
    });
  });
});
