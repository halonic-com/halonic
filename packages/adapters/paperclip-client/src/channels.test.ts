import { verifies } from "@halonicjs/testing-spec";
import { beforeEach, describe, expect, it } from "vitest";
import { acmeData, agentAda, agentBo, company, me } from "./acme-data.test-helper.ts";
import { channelMembersLine } from "./channels.ts";
import {
  asListed,
  connect,
  FakePaperclip,
  type Network,
  type SeenRequest,
  sourceId as source,
} from "./fake-paperclip.test-helper.ts";
import { paperclipRequests } from "./requests.ts";

const channelTask = "i0000000-0000-4000-8000-000000000009";
const childTask = "i0000000-0000-4000-8000-000000000010";
const channel = `${source}:channel:${channelTask}`;
const ada = `${source}:agent:${agentAda}`;
const bo = `${source}:agent:${agentBo}`;

/** Acme's channel Engineering, Ada its lead and Bo a member, as the provider would make it. */
function engineering(overrides: Record<string, unknown> = {}) {
  return {
    id: channelTask,
    companyId: company,
    identifier: "ACME-9",
    title: "Engineering",
    status: "todo",
    labels: [{ name: " Channel " }],
    createdByUserId: me,
    createdByAgentId: null,
    description: `A channel in Halonic.\n\n${channelMembersLine([agentAda, agentBo], agentAda)}`,
    updatedAt: "2026-11-24T10:09:00.000Z",
    ...overrides,
  };
}

let paperclip: FakePaperclip;
const network: Network = { offline: false };

/** Serves Acme with `tasks` added to its open tasks, and the routes a channel message uses. */
function serve(...tasks: Record<string, unknown>[]): void {
  const data = acmeData();
  for (const task of tasks) {
    paperclip.on("GET", `/api/issues/${String(task["id"])}`, { body: task });
  }
  paperclip
    .serveAcme(data)
    .on("GET", `/api/companies/${company}/issues`, ({ query }) => ({
      body: asListed([...data.tasks, ...tasks], query),
    }))
    .on("GET", `/api/issues/${channelTask}`, { body: engineering() })
    .on("GET", `/api/issues/${channelTask}/comments`, {
      body: [{ id: "c1", body: "Hi all", authorUserId: me, createdAt: "2026-11-24T10:08:00.000Z" }],
    })
    .on("POST", `/api/issues/${channelTask}/comments`, ({ body }) => ({
      body: {
        id: "c2",
        body: (body as { body: string }).body,
        authorUserId: me,
        createdAt: "2026-11-24T10:10:00.000Z",
      },
    }))
    .on("POST", `/api/companies/${company}/issues`, { status: 201, body: { id: childTask } });
}

beforeEach(() => {
  network.offline = false;
  paperclip = new FakePaperclip();
});

const client = () => connect(paperclip, network);
const posts = (): SeenRequest[] => paperclip.seen.filter((request) => request.method === "POST");
const childTasksMade = () => posts().filter((request) => request.path.endsWith("/issues"));

verifies("paperclip-client.channels", () => {
  describe("the channel request rows", () => {
    it("are a comment and a task create pinned to its fields and status todo", () => {
      expect(paperclipRequests.commentOnChannel).toEqual({
        method: "POST",
        path: "/api/issues/:task/comments",
      });
      expect(paperclipRequests.createChildTask).toEqual({
        method: "POST",
        path: "/api/companies/:company/issues",
        body: {
          fields: ["title", "description", "parentId", "assigneeAgentId", "status"],
          status: "todo",
        },
      });
    });
  });

  describe("listing channels", () => {
    it("lists a channel with its lead and members, next to the chats", async () => {
      serve(engineering());
      const conversations = await client().listConversations();
      expect(conversations.map((each) => each.title)).toEqual(["Engineering", "Chat with Ada"]);
      expect(conversations[0]).toMatchObject({ id: channel, agent: ada, members: [ada, bo] });
    });

    it("lists no channel an agent made, nor one without the tag or a members line", async () => {
      const line = channelMembersLine([agentAda, agentBo], agentAda);
      serve(
        engineering({ id: "t1", createdByUserId: null, createdByAgentId: agentBo }),
        engineering({ id: "t2", labels: [] }),
        engineering({ id: "t3", description: `> ${line}` }),
        engineering({ id: "t4", createdByUserId: "someone-else" }),
      );
      const conversations = await client().listConversations();
      expect(conversations.map((each) => each.title)).toEqual(["Chat with Ada"]);
    });

    it("reads a channel's messages from its task's comments", async () => {
      serve(engineering());
      const messages = await client().listMessages(channel);
      expect(messages).toMatchObject([
        { conversation: channel, body: "Hi all", author: { kind: "me" } },
      ]);
    });
  });

  describe("sending in a channel", () => {
    it("makes exactly one child task, for Bo, holding the person's text labelled as the board's", async () => {
      serve(engineering());
      const result = await client().send(channel, "Check the build\nthen tell me", [], {
        to: [bo],
      });
      expect(posts().map((request) => request.path)).toEqual([
        `/api/issues/${channelTask}/comments`,
        `/api/companies/${company}/issues`,
      ]);
      expect(childTasksMade()[0]?.body).toEqual({
        title: "Engineering: Check the build",
        description: [
          "The board wrote in the channel Engineering:",
          "",
          "> Check the build",
          "> then tell me",
          "",
          "<!-- halonic-channel-message c2 -->",
        ].join("\n"),
        parentId: channelTask,
        assigneeAgentId: agentBo,
        status: "todo",
      });
      expect(result).toMatchObject({
        outcome: "sent",
        message: {
          conversation: channel,
          author: { kind: "me" },
          to: [bo],
          work: [{ agent: bo, state: "starting", work: `${source}:task:${childTask}` }],
        },
      });
    });

    it("sends to the lead alone when `to` is empty, whatever names the text holds", async () => {
      serve(engineering());
      await client().send(channel, "@Bo do X", [], { to: [] });
      const made = childTasksMade();
      expect(made).toHaveLength(1);
      expect(made[0]?.body).toMatchObject({ assigneeAgentId: agentAda });
      // Bo is woken by no request: none assigns Bo, and the comment carries the text only.
      expect(posts().filter((request) => JSON.stringify(request.body).includes(agentBo))).toEqual(
        [],
      );
    });

    it("refuses a `to` outside the channel, and sends nothing", async () => {
      serve(engineering());
      const stranger = `${source}:agent:a0000000-0000-4000-8000-000000000099`;
      const result = await client().send(channel, "Hi", [], { to: [stranger] });
      expect(result).toEqual({ outcome: "refused", reason: "not-found" });
      expect(posts()).toEqual([]);
    });

    it("refuses a task that isn't a channel, and one of another company", async () => {
      serve();
      paperclip.on("GET", `/api/issues/${channelTask}`, {
        body: engineering({ companyId: "c-other" }),
      });
      await expect(client().send(channel, "Hi")).resolves.toEqual({
        outcome: "refused",
        reason: "not-found",
      });
      paperclip.on("GET", `/api/issues/${channelTask}`, { body: engineering({ labels: [] }) });
      await expect(client().send(channel, "Hi")).resolves.toEqual({
        outcome: "refused",
        reason: "not-found",
      });
      expect(posts()).toEqual([]);
    });

    it("refuses offline and queues nothing", async () => {
      serve(engineering());
      network.offline = true;
      await expect(client().send(channel, "Hi")).resolves.toEqual({
        outcome: "refused",
        reason: "offline",
      });
      network.offline = false;
      expect(paperclip.seen).toEqual([]);
    });

    it("shows a child task Paperclip refused as a failed line, after the message went", async () => {
      serve(engineering());
      paperclip.on("POST", `/api/companies/${company}/issues`, { status: 422, body: {} });
      const result = await client().send(channel, "Hi", [], { to: [bo] });
      expect(result).toMatchObject({
        outcome: "sent",
        message: { work: [{ agent: bo, state: "failed" }] },
      });
    });
  });
});
