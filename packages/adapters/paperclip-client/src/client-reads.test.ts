import { verifies } from "@halonicjs/testing-spec";
import { beforeEach, describe, expect, it } from "vitest";
import {
  acmeData,
  agentAda,
  agentBo,
  approvalId,
  chatTask,
  company,
  confirmCard,
  plainTask,
  questionCard,
  websiteProject,
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
  describe("reads", () => {
    it("names its source and says whether it is online, offline as of when, or signed out", async () => {
      paperclip.serveAcme();
      const messaging = client();
      await messaging.listAgents();
      expect(await messaging.listSources()).toEqual([
        {
          id: source,
          provider: "paperclip",
          label: "Paperclip · Acme",
          state: { kind: "online", asOf: now.toISOString() },
        },
      ]);
      network.offline = true;
      await expect(messaging.listAgents()).rejects.toMatchObject({ reason: "offline" });
      expect((await messaging.listSources())[0]?.state).toEqual({
        kind: "offline",
        asOf: now.toISOString(),
      });
      network.offline = false;
      paperclip.on("GET", `/api/companies/${company}/agents`, {
        status: 401,
        body: { error: "expired" },
      });
      await expect(messaging.listAgents()).rejects.toMatchObject({ reason: "signed-out" });
      expect((await messaging.listSources())[0]?.state).toEqual({ kind: "signed-out" });
    });

    it("lists agents with opaque IDs", async () => {
      paperclip.serveAcme();
      expect(await client().listAgents()).toEqual([
        {
          id: `${source}:agent:${agentAda}`,
          source,
          name: "Ada",
          title: "CTO",
          activity: "working",
        },
        { id: `${source}:agent:${agentBo}`, source, name: "Bo", activity: "paused" },
      ]);
    });

    it("lists chats as conversations, and none when Agent Chat is off", async () => {
      paperclip.serveAcme();
      expect(await client().listConversations()).toEqual([
        {
          id: `${source}:chat:${chatTask}`,
          source,
          agent: `${source}:agent:${agentAda}`,
          title: "Chat with Ada",
          updatedAt: "2026-11-24T10:05:00.000Z",
          waitingForMe: true,
        },
      ]);
      paperclip.on("GET", `/api/companies/${company}/chats`, {
        status: 404,
        body: { error: "Agent Chat is disabled" },
      });
      expect(await client().listConversations()).toEqual([]);
    });

    it("lists a chat's messages oldest first, without deleted ones", async () => {
      paperclip.serveAcme();
      const messages = await client().listMessages(`${source}:chat:${chatTask}`);
      expect(messages.map((message) => [message.body, message.author])).toEqual([
        ["Hello Ada", { kind: "me" }],
        ["Shall I go on?", { kind: "agent", agent: `${source}:agent:${agentAda}`, name: "Ada" }],
      ]);
      expect(paperclip.seen.at(-1)?.query.get("order")).toBe("desc");
      expect(await client().listMessages("someone-else:chat:1")).toEqual([]);
    });

    it("lists every card for the person across the company, chat or not, and pending approvals", async () => {
      paperclip.serveAcme();
      const items = await client().listInboxItems();
      expect(items.map((item) => [item.id, item.work, item.question])).toEqual([
        [card(plainTask, confirmCard), `${source}:task:${plainTask}`, "Launch on Friday?"],
        [card(plainTask, questionCard), `${source}:task:${plainTask}`, "Which colour?"],
        [
          `${source}:approval:${approvalId}`,
          `${source}:task:${plainTask}`,
          "Hire a designer\n\nOne more seat",
        ],
      ]);
      expect(items[0]?.options).toEqual([
        { id: "accept", label: "Yes, Friday" },
        { id: "reject", label: "Reject" },
      ]);
      expect(items[0]?.from).toEqual({
        kind: "agent",
        agent: `${source}:agent:${agentBo}`,
        name: "Bo",
      });
      expect(items[1]?.options).toEqual([{ id: "red", label: "Red" }]);
      const project = { id: `${source}:project:${websiteProject}`, name: "Website" };
      expect(items.map((item) => item.project)).toEqual([project, project, project]);
      expect(
        paperclip.seen.find((request) => request.path.endsWith("/approvals"))?.query.get("status"),
      ).toBe("pending");
    });

    it("leaves the project out when the card's task has none", async () => {
      const data = acmeData();
      const [task] = data.tasks;
      if (task !== undefined) {
        delete task.projectId;
      }
      paperclip.serveAcme(data);
      const cards = (await client().listInboxItems()).filter((item) => item.id.includes(":card:"));
      expect(cards.map((item) => "project" in item)).toEqual([false, false]);
    });

    it("shows a new card on a task that isn't a chat after one poll, reading only tasks that changed", async () => {
      const data = acmeData();
      data.cards = [];
      paperclip.serveAcme(data);
      const messaging = client();
      expect(await messaging.listInboxItems()).toHaveLength(1);
      paperclip.seen.length = 0;
      expect(await messaging.listInboxItems()).toHaveLength(1);
      expect(seenRoutes().filter((route) => route.endsWith("/interactions"))).toEqual([]);

      data.cards = acmeData().cards;
      const [task] = data.tasks;
      if (task !== undefined) {
        task.updatedAt = "2026-11-24T10:09:00.000Z";
      }
      const items = await messaging.listInboxItems();
      expect(items.map((item) => item.id)).toContain(card(plainTask, confirmCard));
      expect(seenRoutes().filter((route) => route.endsWith("/interactions"))).toEqual([
        `GET /api/issues/${plainTask}/interactions`,
      ]);
    });

    it("lists open tasks as work, newest change first", async () => {
      paperclip.serveAcme();
      const work = await client().listWork();
      expect(work[0]).toEqual({
        id: `${source}:task:${plainTask}`,
        source,
        label: "ACME-7",
        title: "Pick a launch date",
        state: "in-review",
        assignee: `${source}:agent:${agentBo}`,
        blockedBy: [],
        updatedAt: "2026-11-24T10:00:00.000Z",
      });
      expect(paperclip.seen[0]?.query.get("status")).toBe(
        "backlog,todo,in_progress,in_review,blocked",
      );
    });

    it("searches agents, chats, inbox items and work", async () => {
      paperclip.serveAcme();
      const hits = await client().search("LAUNCH");
      expect(hits.map((hit) => [hit.kind, hit.id])).toEqual([
        ["inbox-item", card(plainTask, confirmCard)],
        ["work", `${source}:task:${plainTask}`],
      ]);
      expect(await client().search("  ")).toEqual([]);
    });
  });
});
