import { gatewayMessagingIdPattern, type MessagingId } from "@halonicjs/ports";
import { offPatternMessagingIds } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { beforeEach, describe, expect, it } from "vitest";
import {
  acmeData,
  agentAda,
  agentBo,
  company,
  confirmCard,
  me,
  plainTask,
  testKey,
} from "./acme-data.test-helper.ts";
import { channelMembersLine } from "./channels.ts";
import { PaperclipMessaging } from "./client.ts";
import { asListed, FakePaperclip } from "./fake-paperclip.test-helper.ts";

// `PaperclipIds` joins the encoded connection, kind and Paperclip's own ids, and nothing caps the
// total, so the ids here are as long as real ones get: a long connection name and UUIDs throughout.
const connection = "acme-research-and-development-europe-west-production-connection";
const channelTask = "i0000000-0000-4000-8000-000000000009";
const commentIds = [
  "d0000000-0000-4000-8000-000000000001",
  "d0000000-0000-4000-8000-000000000002",
] as const;

/** Acme's chat comments with UUID ids, one by Ada and one by the person. */
function comments() {
  return [
    {
      id: commentIds[0],
      body: "Shall I go on?",
      authorAgentId: agentAda,
      createdAt: "2026-11-24T10:02:00.000Z",
    },
    {
      id: commentIds[1],
      body: "Hello Ada",
      authorUserId: me,
      createdAt: "2026-11-24T10:01:00.000Z",
    },
  ];
}

/** Acme's channel Engineering, Ada its lead and Bo a member. */
function engineering() {
  return {
    id: channelTask,
    companyId: company,
    identifier: "ACME-9",
    title: "Engineering",
    status: "todo",
    labels: [{ name: "Channel" }],
    createdByUserId: me,
    createdByAgentId: null,
    description: `A channel in Halonic.\n\n${channelMembersLine([agentAda, agentBo], agentAda)}`,
    updatedAt: "2026-11-24T10:09:00.000Z",
  };
}

/** Acme with UUID comments, a channel Bo wrote in, and a confirmation card Bo answered. */
function serve(paperclip: FakePaperclip): void {
  const data = acmeData();
  const answered = data.cards.map((card) =>
    card.id === confirmCard
      ? {
          ...card,
          status: "accepted",
          resolvedByAgentId: agentBo,
          resolvedAt: "2026-11-24T10:03:00.000Z",
        }
      : card,
  );
  paperclip
    .serveAcme({ ...data, comments: comments(), cards: answered })
    .on("GET", `/api/companies/${company}/issues`, ({ query }) => ({
      body: asListed([...data.tasks, engineering()], query),
    }))
    .on("GET", `/api/issues/${channelTask}`, { body: engineering() })
    .on("GET", `/api/issues/${channelTask}/interactions`, { body: [] })
    .on("GET", `/api/issues/${channelTask}/comments`, {
      body: [
        {
          id: commentIds[0],
          body: "On it",
          authorAgentId: agentBo,
          createdAt: "2026-11-24T10:08:00.000Z",
        },
      ],
    })
    .on("POST", `/api/issues/${channelTask}/comments`, {
      body: {
        id: commentIds[1],
        body: "Bo, ship it",
        authorUserId: me,
        createdAt: "2026-11-24T10:10:00.000Z",
      },
    })
    .on("POST", `/api/companies/${company}/issues`, { status: 201, body: { id: plainTask } });
}

/** The client for the long-named Acme connection on `paperclip`. */
function connect(paperclip: FakePaperclip): PaperclipMessaging {
  return new PaperclipMessaging({
    address: paperclip.address,
    key: testKey,
    connection,
    company,
    label: "Paperclip · Acme",
    userId: me,
    now: () => new Date("2026-11-24T10:10:00.000Z"),
    fetch: (input, init) => paperclip.fetch(input, init),
  });
}

let paperclip: FakePaperclip;

beforeEach(() => {
  paperclip = new FakePaperclip();
  serve(paperclip);
});

verifies("contracts.agent-messaging-ids", () => {
  describe("PaperclipMessaging's ids", () => {
    it("lists no id that breaks gatewayMessagingIdPattern, references included", async () => {
      const port = connect(paperclip);

      expect(await offPatternMessagingIds(port)).toEqual([]);
    });

    it("lists the references the check reads: channel members, agent authors and who answered", async () => {
      const port = connect(paperclip);
      const conversations = await port.listConversations();
      const channel = conversations.find((each) => each.title === "Engineering");
      const card = (await port.listInboxItems()).find((item) => item.state.kind === "answered");

      expect(channel?.members).toHaveLength(2);
      expect(await port.listMessages(channel?.id ?? "")).toMatchObject([
        { author: { kind: "agent" } },
      ]);
      expect(card?.state).toMatchObject({ by: { kind: "agent" } });
    });

    it("sends to a channel member with a message whose to and ids follow the pattern", async () => {
      const port = connect(paperclip);
      const channel = (await port.listConversations()).find((each) => each.title === "Engineering");
      const bo = channel?.members?.find((member) => member.endsWith(agentBo)) ?? "";

      const result = await port.send(channel?.id ?? "", "Bo, ship it", [], { to: [bo] });

      expect(result.outcome).toBe("sent");
      const message = result.outcome === "sent" ? result.message : undefined;
      const ids: MessagingId[] = [
        message?.id ?? "",
        message?.conversation ?? "",
        ...(message?.to ?? []),
      ];
      expect(ids.filter((id) => !gatewayMessagingIdPattern.test(id))).toEqual([]);
    });
  });
});
