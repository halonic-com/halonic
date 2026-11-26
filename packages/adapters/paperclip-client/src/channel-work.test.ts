import { verifies } from "@halonicjs/testing-spec";
import { beforeEach, describe, expect, it } from "vitest";
import { acmeData, agentAda, agentBo, company, me } from "./acme-data.test-helper.ts";
import { channelMembersLine, childTaskDescription } from "./channels.ts";
import {
  asListed,
  connect,
  FakePaperclip,
  type Network,
  sourceId as source,
} from "./fake-paperclip.test-helper.ts";
import { paperclipRequests } from "./requests.ts";

const channelTask = "i0000000-0000-4000-8000-000000000009";
const childTask = "i0000000-0000-4000-8000-000000000010";
const agentCy = "a0000000-0000-4000-8000-000000000003";
const channel = `${source}:channel:${channelTask}`;
const ada = `${source}:agent:${agentAda}`;
const bo = `${source}:agent:${agentBo}`;
const cy = `${source}:agent:${agentCy}`;
const work = `${source}:task:${childTask}`;

/** Acme's channel Engineering, Ada its lead, Bo and Cy members. */
const engineering = {
  id: channelTask,
  companyId: company,
  title: "Engineering",
  status: "todo",
  labels: [{ name: "channel" }],
  createdByUserId: me,
  createdByAgentId: null,
  description: channelMembersLine([agentAda, agentBo, agentCy], agentAda),
  updatedAt: "2026-11-24T10:09:00.000Z",
};

/** The child task the person's message "Check the build" (comment c1) made for Bo. */
function child(overrides: Record<string, unknown> = {}) {
  return {
    id: childTask,
    companyId: company,
    parentId: channelTask,
    title: "Engineering: Check the build",
    status: "in_progress",
    assigneeAgentId: agentBo,
    createdByUserId: me,
    createdByAgentId: null,
    description: childTaskDescription("Engineering", "Check the build", "c1"),
    updatedAt: "2026-11-24T10:20:00.000Z",
    ...overrides,
  };
}

/** A hand-off of the child task, as Paperclip's activity records an agent's reassignment. */
function handOff(from: string, to: string, at: string) {
  return {
    action: "issue.updated",
    actorType: "agent",
    actorId: from,
    details: { _previous: { status: "in_progress", assigneeAgentId: from }, assigneeAgentId: to },
    createdAt: at,
  };
}

let paperclip: FakePaperclip;
const network: Network = { offline: false };

/** Serves Acme with the channel, `children` as its child tasks and `activity` as each one's history. */
function serve(
  children: Record<string, unknown>[],
  activity: Record<string, unknown>[] = [],
): void {
  const data = acmeData();
  paperclip
    .serveAcme(data)
    .on("GET", `/api/companies/${company}/issues`, ({ query }) => ({
      body:
        query.get("parentId") === channelTask
          ? children
          : asListed([...data.tasks, engineering], query),
    }))
    .on("GET", `/api/issues/${channelTask}`, { body: engineering })
    .on("GET", `/api/issues/${channelTask}/comments`, {
      body: [
        {
          id: "c1",
          body: "Check the build",
          authorUserId: me,
          createdAt: "2026-11-24T10:10:00.000Z",
        },
      ],
    })
    .on("GET", `/api/issues/${childTask}/comments`, {
      body: [
        {
          id: "r2",
          body: "Build is green",
          authorAgentId: agentBo,
          createdAt: "2026-11-24T10:15:00.000Z",
        },
        {
          id: "r1",
          body: "A note of mine",
          authorUserId: me,
          createdAt: "2026-11-24T10:12:00.000Z",
        },
      ],
    })
    .on("GET", `/api/issues/${childTask}/activity`, { body: activity })
    // `refresh` reads every open task's cards, the channel's included.
    .on("GET", `/api/issues/${channelTask}/interactions`, { body: [] });
}

beforeEach(() => {
  network.offline = false;
  paperclip = new FakePaperclip();
});

const client = () => connect(paperclip, network);
const writes = () => paperclip.seen.filter((request) => request.method !== "GET");

verifies("paperclip-client.channel-work", () => {
  it("reads a child task's history through one GET row", () => {
    expect(paperclipRequests.listTaskActivity).toEqual({
      method: "GET",
      path: "/api/issues/:task/activity",
    });
  });

  it("shows a member's reply on its child task as that agent's message in the channel", async () => {
    serve([child()]);
    const messages = await client().listMessages(channel);
    expect(messages.map((message) => message.body)).toEqual(["Check the build", "Build is green"]);
    expect(messages[1]).toMatchObject({
      id: `${source}:comment:${childTask}:r2`,
      conversation: channel,
      author: { kind: "agent", agent: bo, name: "Bo" },
    });
    expect(messages[0]?.work).toEqual([
      { agent: bo, state: "working", work, since: "2026-11-24T10:20:00.000Z" },
    ]);
  });

  it("posts nothing when it lists messages or refreshes, so no agent's comment is re-posted", async () => {
    serve([child()]);
    const messaging = client();
    await messaging.listMessages(channel);
    await messaging.refresh();
    expect(writes()).toEqual([]);
  });

  it("shows three hand-offs of one child task as three passed-on lines", async () => {
    serve(
      [child({ assigneeAgentId: agentAda })],
      [
        // Paperclip lists the newest first.
        handOff(agentCy, agentAda, "2026-11-24T10:14:00.000Z"),
        handOff(agentBo, agentCy, "2026-11-24T10:13:00.000Z"),
        { action: "issue.comment_added", details: { commentId: "r2" } },
        handOff(agentAda, agentBo, "2026-11-24T10:12:00.000Z"),
      ],
    );
    const [message] = await client().listMessages(channel);
    expect(message?.work).toEqual([
      { agent: ada, state: "passed-on", work, passedTo: bo, since: "2026-11-24T10:12:00.000Z" },
      { agent: bo, state: "passed-on", work, passedTo: cy, since: "2026-11-24T10:13:00.000Z" },
      { agent: cy, state: "passed-on", work, passedTo: ada, since: "2026-11-24T10:14:00.000Z" },
      { agent: ada, state: "working", work, since: "2026-11-24T10:20:00.000Z" },
    ]);
  });

  it.each([
    ["todo", "starting"],
    ["in_progress", "working"],
    ["in_review", "working"],
    ["done", "answered"],
    ["cancelled", "failed"],
  ])("maps a child task's status %s to %s", async (status, state) => {
    serve([child({ status })]);
    const [message] = await client().listMessages(channel);
    expect(message?.work).toMatchObject([{ agent: bo, state }]);
  });

  it("counts no child an agent made, none without the line or with it quoted, none of another parent", async () => {
    const line = "<!-- halonic-channel-message c1 -->";
    serve([
      child({ createdByUserId: null, createdByAgentId: agentBo }),
      child({ createdByUserId: "someone-else" }),
      child({ description: "Check the build" }),
      child({ description: `> ${line}` }),
      child({ parentId: "i0000000-0000-4000-8000-000000000099" }),
      child({ description: childTaskDescription("Engineering", "Hi", "c-not-listed") }),
    ]);
    const messages = await client().listMessages(channel);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.work).toBeUndefined();
  });

  it("reads a child task whole when the list cut its description, where the message line is", async () => {
    serve([child({ description: "The board wrote in the channel", descriptionTruncated: true })]);
    paperclip.on("GET", `/api/issues/${childTask}`, { body: child() });
    const [message] = await client().listMessages(channel);
    expect(message?.work).toMatchObject([{ agent: bo, state: "working" }]);
  });

  it("carries Paperclip's reason when it refuses a child task, on one line", async () => {
    serve([]);
    paperclip
      .on("GET", `/api/issues/${channelTask}`, { body: engineering })
      .on("POST", `/api/issues/${channelTask}/comments`, {
        body: { id: "c2", body: "Hi", authorUserId: me, createdAt: "2026-11-24T10:10:00.000Z" },
      })
      .on("POST", `/api/companies/${company}/issues`, {
        status: 422,
        body: { error: "Agent Bo\nis paused" },
      });
    const result = await client().send(channel, "Hi", [], { to: [bo] });
    expect(result).toMatchObject({
      outcome: "sent",
      message: { work: [{ agent: bo, state: "failed", reason: "Agent Bo is paused" }] },
    });
  });
});

describe("a channel without child tasks", () => {
  it("lists its messages with no work lines", async () => {
    serve([]);
    const messages = await client().listMessages(channel);
    expect(messages).toMatchObject([{ body: "Check the build" }]);
    expect(messages[0]?.work).toBeUndefined();
  });
});
