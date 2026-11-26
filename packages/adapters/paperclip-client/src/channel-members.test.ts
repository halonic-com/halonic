import { verifies } from "@halonicjs/testing-spec";
import { beforeEach, describe, expect, it } from "vitest";
import { acmeData, agentAda, agentBo, company, me } from "./acme-data.test-helper.ts";
import { channelMembersLine, readChannel } from "./channels.ts";
import {
  asListed,
  connect,
  FakePaperclip,
  type Network,
  type SeenRequest,
  sourceId as source,
} from "./fake-paperclip.test-helper.ts";
import { asRecord } from "./json.ts";
import { paperclipRequests } from "./requests.ts";

const channelTask = "i0000000-0000-4000-8000-000000000009";
const labelId = "l0000000-0000-4000-8000-000000000001";
const channel = `${source}:channel:${channelTask}`;
const ada = `${source}:agent:${agentAda}`;
const bo = `${source}:agent:${agentBo}`;
const intro = "Notes the board wrote.";

let paperclip: FakePaperclip;
// Engineering as Paperclip holds it now: a description update changes it.
let parent: Record<string, unknown> & { description?: unknown };
const network: Network = { offline: false };

/** Acme's channel Engineering as Paperclip holds it, with `people` following it. */
function engineering(people?: readonly string[]): Record<string, unknown> {
  return {
    id: channelTask,
    companyId: company,
    title: "Engineering",
    status: "backlog",
    labels: [{ id: labelId, name: "channel" }],
    createdByUserId: me,
    createdByAgentId: null,
    description: `${intro}\n\n${channelMembersLine([agentAda, agentBo], agentAda, people)}\n\nMore notes.`,
    updatedAt: "2026-11-24T10:09:00.000Z",
  };
}

/** Serves Acme, its labels, and Engineering as `parent`, which a description update changes. */
function serve(labels: readonly Record<string, unknown>[] = [{ id: labelId, name: "Channel" }]) {
  const data = acmeData();
  paperclip
    .serveAcme(data)
    .on("GET", `/api/companies/${company}/issues`, ({ query }) => ({
      body: asListed([...data.tasks, parent], query),
    }))
    .on("GET", `/api/issues/${channelTask}`, () => ({ body: parent }))
    .on("PATCH", `/api/issues/${channelTask}`, ({ body }) => {
      // Paperclip touches a task on every update, which is how a delta read sees it changed.
      const updatedAt = new Date(Date.parse(String(parent["updatedAt"])) + 60_000).toISOString();
      parent = { ...parent, ...asRecord(body), updatedAt };
      return { body: parent };
    })
    .on("GET", `/api/companies/${company}/labels`, { body: labels })
    .on("POST", `/api/companies/${company}/labels`, { status: 201, body: { id: labelId } })
    .on("POST", `/api/companies/${company}/issues`, ({ body }) => {
      parent = { ...engineering(), ...asRecord(body), labels: [{ id: labelId, name: "channel" }] };
      return { status: 201, body: parent };
    });
}

beforeEach(() => {
  network.offline = false;
  paperclip = new FakePaperclip();
  parent = engineering();
});

const client = () => connect(paperclip, network);
const writes = (): SeenRequest[] => paperclip.seen.filter((request) => request.method !== "GET");
const titles = (list: readonly { title: string }[]) => list.map((each) => each.title);

verifies("paperclip-client.channel-membership", () => {
  describe("the request rows", () => {
    it("are the company's labels, the channel tag, a pinned parent and its description", () => {
      expect(paperclipRequests.listLabels).toEqual({
        method: "GET",
        path: "/api/companies/:company/labels",
      });
      expect(paperclipRequests.createChannelLabel).toEqual({
        method: "POST",
        path: "/api/companies/:company/labels",
        body: { fields: ["name", "color"], pinned: { name: "channel", color: "#6366f1" } },
      });
      expect(paperclipRequests.createChannel).toEqual({
        method: "POST",
        path: "/api/companies/:company/issues",
        body: {
          fields: ["title", "description", "labelIds", "status"],
          status: "backlog",
          idLists: ["labelIds"],
        },
      });
      expect(paperclipRequests.updateChannel).toEqual({
        method: "PATCH",
        path: "/api/issues/:task",
        body: { fields: ["description"] },
      });
    });
  });

  describe("starting a channel", () => {
    it("makes exactly one unassigned task with the tag and a members line that reads back", async () => {
      serve();
      const result = await client().startChannel("Launch\nplan", [ada, bo], bo);
      expect(writes().map((request) => `${request.method} ${request.path}`)).toEqual([
        `POST /api/companies/${company}/issues`,
      ]);
      const body = writes()[0]?.body;
      expect(Object.keys(asRecord(body) ?? {}).sort()).toEqual([
        "description",
        "labelIds",
        "status",
        "title",
      ]);
      expect(body).toMatchObject({ title: "Launch plan", labelIds: [labelId], status: "backlog" });
      expect(readChannel(parent, me)).toMatchObject({
        lead: agentBo,
        members: [agentAda, agentBo],
        people: [me],
      });
      expect(result).toMatchObject({
        outcome: "done",
        conversation: { title: "Launch plan", agent: bo, members: [ada, bo] },
      });
    });

    it("makes the channel tag first when the company has none", async () => {
      serve([]);
      await client().startChannel("Launch", [ada, bo], ada);
      expect(writes().map((request) => request.body)).toMatchObject([
        { name: "channel", color: "#6366f1" },
        { labelIds: [labelId] },
      ]);
    });

    it("refuses 1 or 9 agents, or a lead outside them, with bad-members before any request", async () => {
      serve();
      const nine = Array.from({ length: 9 }, (_, index) => `${source}:agent:a${index}`);
      const messaging = client();
      for (const [members, lead] of [
        [[ada], ada],
        [nine, nine[0] ?? ""],
        [[ada, bo], `${source}:agent:someone`],
        [[ada, ada], ada],
      ] as const) {
        await expect(messaging.startChannel("Launch", members, lead)).resolves.toEqual({
          outcome: "refused",
          reason: "bad-members",
        });
      }
      expect(paperclip.seen).toEqual([]);
    });

    it("refuses agents the company doesn't list, and writes nothing", async () => {
      serve();
      const stranger = `${source}:agent:a0000000-0000-4000-8000-000000000099`;
      const result = await client().startChannel("Launch", [ada, stranger], ada);
      expect(result).toEqual({ outcome: "refused", reason: "bad-members" });
      expect(writes()).toEqual([]);
    });
  });

  describe("changing members", () => {
    it("changes only the members line", async () => {
      serve();
      const before = String(parent.description);
      const result = await client().setMembers(channel, [ada, bo], bo);
      expect(writes().map((request) => request.body)).toEqual([
        {
          description: before.replace(
            channelMembersLine([agentAda, agentBo], agentAda),
            channelMembersLine([agentAda, agentBo], agentBo, [me]),
          ),
        },
      ]);
      expect(result).toMatchObject({ outcome: "done", conversation: { agent: bo } });
    });

    it("refuses bad members before any request", async () => {
      serve();
      await expect(client().setMembers(channel, [ada], ada)).resolves.toEqual({
        outcome: "refused",
        reason: "bad-members",
      });
      expect(paperclip.seen).toEqual([]);
    });
  });

  describe("browsing, joining and leaving", () => {
    it("moves a channel between the conversations and Browse", async () => {
      serve();
      const messaging = client();
      expect(titles(await messaging.browseChannels())).toEqual([]);
      expect(titles(await messaging.listConversations())).toContain("Engineering");

      await expect(messaging.leaveChannel(channel)).resolves.toMatchObject({ outcome: "done" });
      expect(titles(await messaging.browseChannels())).toEqual(["Engineering"]);
      expect(titles(await messaging.listConversations())).not.toContain("Engineering");

      await expect(messaging.joinChannel(channel)).resolves.toMatchObject({ outcome: "done" });
      expect(titles(await messaging.browseChannels())).toEqual([]);
      expect(titles(await messaging.listConversations())).toContain("Engineering");
      expect(String(parent.description).startsWith(`${intro}\n\n`)).toBe(true);
      expect(String(parent.description).endsWith("\n\nMore notes.")).toBe(true);
    });

    it("writes nothing to join a channel the person already follows", async () => {
      serve();
      parent = engineering([me]);
      await expect(client().joinChannel(channel)).resolves.toMatchObject({ outcome: "done" });
      expect(writes()).toEqual([]);
    });
  });

  describe("offline", () => {
    it("refuses each write with offline and queues nothing", async () => {
      serve();
      network.offline = true;
      const messaging = client();
      const offline = { outcome: "refused", reason: "offline" };
      await expect(messaging.startChannel("Launch", [ada, bo], ada)).resolves.toEqual(offline);
      await expect(messaging.setMembers(channel, [ada, bo], ada)).resolves.toEqual(offline);
      await expect(messaging.joinChannel(channel)).resolves.toEqual(offline);
      await expect(messaging.leaveChannel(channel)).resolves.toEqual(offline);
      network.offline = false;
      await messaging.listConversations();
      expect(writes()).toEqual([]);
    });
  });
});
