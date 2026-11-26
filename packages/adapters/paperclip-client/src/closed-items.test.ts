import type { InboxItem } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { acmeData, agentAda, approvalId, company, me, plainTask } from "./acme-data.test-helper.ts";
import { cardToItem } from "./cards.ts";
import { EndedItems, endedKeptMax, endedKeptMs } from "./ended-items.ts";
import { connect, FakePaperclip, sourceId as source } from "./fake-paperclip.test-helper.ts";
import { PaperclipIds } from "./ids.ts";
import type { MapContext } from "./map.ts";

const context: MapContext = { ids: new PaperclipIds("acme"), agentNames: new Map(), userId: me };
const decisionId = "d0000000-0000-4000-8000-000000000001";
const approvalItem = `${source}:approval:${approvalId}`;
const decisionItem = `${source}:decision:${decisionId}`;
const network = { offline: false };

/** An invented Acme confirmation card on the plain task, in `status`. */
function card(status: string, extra: object = {}) {
  return {
    id: "f-ended",
    kind: "request_confirmation",
    status,
    createdByAgentId: agentAda,
    payload: { version: 1, prompt: "Launch on Friday?" },
    createdAt: "2026-11-24T10:00:00.000Z",
    ...extra,
  };
}

/** An invented Acme decision in `status`, with no options. */
function decision(status: string, extra: object) {
  return { id: decisionId, status, title: "Which day?", options: [], ...extra };
}

/** Acme with an open decision, whose approvals route answers what `data.approvals` holds when read. */
function acmeWithDecision() {
  const data = acmeData();
  data.decisions = [decision("open", { createdAt: "2026-11-24T09:45:00.000Z" })];
  const paperclip = new FakePaperclip()
    .serveAcme(data)
    .on("GET", `/api/companies/${company}/approvals`, () => ({ body: data.approvals }));
  return { data, paperclip };
}

const reads = (paperclip: FakePaperclip, path: string) =>
  paperclip.seen.filter((request) => request.path === path);

/** An ended item that answered or closed at `at`. */
function endedAt(id: string, at: string): InboxItem {
  return {
    id,
    source,
    from: { kind: "me" },
    question: "Ship it?",
    options: [],
    attachments: [],
    createdAt: at,
    state: { kind: "closed", reason: "cancelled", closedAt: at },
  };
}

verifies("paperclip-client.closed-items", () => {
  describe("cards that ended without an answer", () => {
    it("lists a cancelled card as closed, with who cancelled it and when", () => {
      const record = card("cancelled", {
        resolvedByUserId: me,
        resolvedAt: "2026-11-24T10:05:00.000Z",
      });
      const item = cardToItem(context, plainTask, record);
      expect(item?.state).toEqual({
        kind: "closed",
        reason: "cancelled",
        closedAt: "2026-11-24T10:05:00.000Z",
        by: { kind: "me" },
      });
    });

    it("reads a failed card as cancelled and an expired one as expired, naming no one", () => {
      const resolvedAt = "2026-11-24T10:05:00.000Z";
      const failed = cardToItem(context, plainTask, card("failed", { resolvedAt }));
      const expired = cardToItem(context, plainTask, card("expired", { resolvedAt }));
      const unknown = cardToItem(context, plainTask, card("archived"));
      expect(failed?.state).toEqual({ kind: "closed", reason: "cancelled", closedAt: resolvedAt });
      expect(expired?.state).toEqual({ kind: "closed", reason: "expired", closedAt: resolvedAt });
      expect(unknown).toBeUndefined();
    });
  });

  describe("approvals and decisions that ended elsewhere", () => {
    it("reads an approval gone from the waiting list once, and lists it with who decided", async () => {
      const { data, paperclip } = acmeWithDecision();
      const client = connect(paperclip, network);
      await client.listInboxItems();
      const [approval] = data.approvals;
      data.approvals = [];
      paperclip.on("GET", `/api/approvals/${approvalId}`, {
        body: {
          ...approval,
          status: "approved",
          decidedByUserId: "u-other",
          decidedAt: "2026-11-24T10:06:00.000Z",
        },
      });

      const items = await client.listInboxItems();
      await client.listInboxItems();

      expect(items.find((item) => item.id === approvalItem)?.state).toEqual({
        kind: "answered",
        by: { kind: "person", name: "Board" },
        answer: { kind: "option", option: "approve" },
        answeredAt: "2026-11-24T10:06:00.000Z",
      });
      expect(reads(paperclip, `/api/approvals/${approvalId}`)).toHaveLength(1);
    });

    it("looks a gone decision up among the decided, then the expired, and stops once it is found", async () => {
      const { data, paperclip } = acmeWithDecision();
      const client = connect(paperclip, network);
      await client.listInboxItems();
      data.decisions = [decision("expired", { updatedAt: "2026-11-24T10:07:00.000Z" })];

      const items = await client.listInboxItems();

      expect(items.find((item) => item.id === decisionItem)?.state).toEqual({
        kind: "closed",
        reason: "expired",
        closedAt: "2026-11-24T10:07:00.000Z",
      });
      const statuses = reads(paperclip, `/api/companies/${company}/decisions`).map((request) =>
        request.query.get("status"),
      );
      expect(statuses).toEqual(["open", "open", "decided", "expired"]);
    });

    it("closes one it can't find as cancelled from the time it was missed", async () => {
      const { data, paperclip } = acmeWithDecision();
      const client = connect(paperclip, network);
      await client.listInboxItems();
      data.decisions = [];

      const items = await client.listInboxItems();

      expect(items.find((item) => item.id === decisionItem)?.state).toEqual({
        kind: "closed",
        reason: "cancelled",
        closedAt: "2026-11-24T10:10:00.000Z",
      });
    });

    it("reads it again on the next list when the read failed", async () => {
      const { data, paperclip } = acmeWithDecision();
      const client = connect(paperclip, network);
      await client.listInboxItems();
      data.approvals = [];
      paperclip.on("GET", `/api/approvals/${approvalId}`, { status: 500, body: { error: "down" } });

      await expect(client.listInboxItems()).rejects.toThrow();
      paperclip.on("GET", `/api/approvals/${approvalId}`, {
        body: { id: approvalId, status: "cancelled", updatedAt: "2026-11-24T10:08:00.000Z" },
      });
      const items = await client.listInboxItems();

      expect(items.find((item) => item.id === approvalItem)?.state).toMatchObject({
        kind: "closed",
        reason: "cancelled",
      });
    });

    it("closes an approval Paperclip no longer finds as cancelled, and goes on listing", async () => {
      const { data, paperclip } = acmeWithDecision();
      const client = connect(paperclip, network);
      await client.listInboxItems();
      data.approvals = [];
      paperclip.on("GET", `/api/approvals/${approvalId}`, { status: 404, body: { error: "gone" } });

      const items = await client.listInboxItems();
      const again = await client.listInboxItems();

      expect(items.find((item) => item.id === approvalItem)?.state).toEqual({
        kind: "closed",
        reason: "cancelled",
        closedAt: "2026-11-24T10:10:00.000Z",
      });
      expect(again.some((item) => item.id === decisionItem)).toBe(true);
      expect(reads(paperclip, `/api/approvals/${approvalId}`)).toHaveLength(1);
    });

    it("keeps an approval it reads back as still waiting open, not cancelled", async () => {
      const { data, paperclip } = acmeWithDecision();
      const client = connect(paperclip, network);
      await client.listInboxItems();
      const [approval] = data.approvals;
      data.approvals = [];
      paperclip.on("GET", `/api/approvals/${approvalId}`, { body: approval });

      const items = await client.listInboxItems();

      expect(items.find((item) => item.id === approvalItem)?.state).toEqual({ kind: "open" });
    });

    it("keeps a decision open when a full page of newer open decisions pushed it off", async () => {
      const { data, paperclip } = acmeWithDecision();
      const client = connect(paperclip, network);
      await client.listInboxItems();
      data.decisions = Array.from({ length: 100 }, (_, index) => ({
        ...decision("open", { createdAt: "2026-11-24T10:00:00.000Z" }),
        id: `d0000000-0000-4000-8000-1${String(index).padStart(11, "0")}`,
      }));

      const items = await client.listInboxItems();

      expect(items.find((item) => item.id === decisionItem)?.state).toEqual({ kind: "open" });
    });

    it("dates an approval decided with no time from the read that found it", async () => {
      const { data, paperclip } = acmeWithDecision();
      const client = connect(paperclip, network);
      await client.listInboxItems();
      const [approval] = data.approvals;
      data.approvals = [];
      paperclip.on("GET", `/api/approvals/${approvalId}`, {
        body: { ...approval, status: "approved", decidedByUserId: me, decidedAt: undefined },
      });

      const items = await client.listInboxItems();

      expect(items.find((item) => item.id === approvalItem)?.state).toMatchObject({
        kind: "answered",
        answeredAt: "2026-11-24T10:10:00.000Z",
      });
    });

    it("forgets an ended item a day after it ended, with room left under the cap", async () => {
      const ended = new EndedItems();
      const endedAtTime = "2026-11-24T12:00:00.000Z";
      const item = endedAt("acme:approval:day", endedAtTime);
      const at = (ms: number) => new Date(Date.parse(endedAtTime) + ms);
      await ended.list([item], () => Promise.resolve([]), at(0));
      const lookUp = () => Promise.resolve([item]);

      const afterADay = await ended.list([], lookUp, at(endedKeptMs));
      const later = await ended.list([], lookUp, at(endedKeptMs + 1));

      expect(afterADay.map((each) => each.id)).toEqual([item.id]);
      expect(later).toEqual([]);
    });

    it("drops the one stale item from a short list, keeping the rest", async () => {
      const ended = new EndedItems();
      const now = new Date("2026-11-25T12:00:00.000Z");
      const fresh = endedAt("acme:approval:fresh", "2026-11-25T11:00:00.000Z");
      const stale = endedAt("acme:approval:stale", "2026-11-24T11:00:00.000Z");
      await ended.list([fresh, stale], () => Promise.resolve([]), now);

      const kept = await ended.list([], () => Promise.resolve([fresh, stale]), now);

      expect(kept.map((item) => item.id)).toEqual([fresh.id]);
    });

    it("keeps an ended item a day, and at most the 50 that ended last", async () => {
      const ended = new EndedItems();
      const now = new Date("2026-11-25T12:00:00.000Z");
      const recent = Array.from({ length: 60 }, (_, index) =>
        endedAt(
          `acme:approval:${index}`,
          new Date(now.getTime() - (index + 1) * 60_000).toISOString(),
        ),
      );
      const old = endedAt("acme:approval:old", "2026-11-24T11:00:00.000Z");
      await ended.list([...recent, old], () => Promise.resolve([]), now);

      const kept = await ended.list([], () => Promise.resolve([...recent, old]), now);

      expect(endedKeptMax).toBe(50);
      expect(kept.map((item) => item.id)).toEqual(recent.slice(0, 50).map((item) => item.id));
    });
  });
});
