import { verifies } from "@halonicjs/testing-spec";
import type { PluginApiRequestInput, PluginEvent } from "@paperclipai/plugin-sdk";
import { describe, expect, it } from "vitest";
import {
  type BoardMentionsApi,
  boardMentions,
  boardMentionsRouteKey,
  handleBoardMentions,
  mentionedUserIds,
  mostIdsPerComment,
  mostMentions,
} from "./board-mentions.ts";
import { fakeState } from "./fake-host.test-helper.ts";
import { manifest } from "./manifest.ts";
import { agentActor, boardActor } from "./reactions.test-helper.ts";

const now = new Date("2026-11-26T12:00:00.000Z");
const task = { id: "task-7", identifier: "ACME-7", title: "Ship the price page", status: "todo" };

/** Ada's comment that picks the board in Paperclip's mention picker. */
const mention = {
  id: "c-1",
  body: "[Board](user://user-board) can you pick the launch date?",
  authorAgentId: "agent-ada",
  authorUserId: null,
  createdAt: new Date("2026-11-26T10:00:00.000Z"),
};

/** A comment that names the board in plain text only. */
const plainText = {
  id: "c-2",
  body: "Board, can you look at this? user-board knows.",
  authorAgentId: "agent-ada",
  authorUserId: null,
  createdAt: new Date("2026-11-26T11:00:00.000Z"),
};

/** The plugin's host with ACME-7 and `comments` on it, state in memory. */
function fakeApi(comments: unknown[], status = task.status) {
  const { state } = fakeState();
  const errors: string[] = [];
  const api: BoardMentionsApi = {
    state,
    issues: {
      get: async (id: string) => (id === task.id ? { ...task, status } : null),
      listComments: async (id: string) => (id === task.id ? comments : []),
    } as unknown as BoardMentionsApi["issues"],
    logger: { error: (message: string) => errors.push(message) },
  };
  return { api, errors };
}

function commented(commentId: string): PluginEvent {
  return {
    eventType: "issue.comment.created",
    companyId: "acme",
    entityId: task.id,
    payload: { issueId: task.id, commentId },
  } as unknown as PluginEvent;
}

function mentionsRequest(actor: PluginApiRequestInput["actor"], since?: string) {
  return {
    routeKey: "board-mentions",
    method: "GET",
    path: "/board/mentions",
    params: {},
    query: { companyId: "acme", ...(since === undefined ? {} : { since }) },
    body: null,
    actor,
    companyId: "acme",
    headers: {},
  } as unknown as PluginApiRequestInput;
}

/** The route's mentions for the board after the plugin saw `seen` comments being made. */
async function routeAfter(api: BoardMentionsApi, seen: string[], since?: string) {
  const index = boardMentions(api);
  for (const id of seen) await index.onCommentCreated(commented(id), now);
  const answer = await handleBoardMentions(mentionsRequest(boardActor, since), api, now);
  return (answer.body as { mentions: Record<string, unknown>[] }).mentions;
}

verifies("paperclip.board-mentions", () => {
  describe("the board mentions route", () => {
    it("answers a comment that links the person with Paperclip's mention link", async () => {
      const reply = { ...plainText, id: "c-3", authorAgentId: null, authorUserId: "user-board" };
      const { api } = fakeApi([mention, reply]);
      expect(await routeAfter(api, ["c-1", "c-3"])).toEqual([
        {
          commentId: "c-1",
          taskId: "task-7",
          identifier: "ACME-7",
          title: "Ship the price page",
          body: mention.body,
          authorAgentId: "agent-ada",
          authorUserId: null,
          createdAt: "2026-11-26T10:00:00.000Z",
          repliedAt: "2026-11-26T11:00:00.000Z",
        },
      ]);
    });

    it("answers nothing for a name or 'board' in plain text", async () => {
      const { api } = fakeApi([plainText]);
      expect(await routeAfter(api, ["c-2"])).toEqual([]);
      expect(mentionedUserIds(plainText.body)).toEqual([]);
    });

    it("leaves out closed tasks, mentions before `since` and the person's own comments", async () => {
      expect(await routeAfter(fakeApi([mention], "done").api, ["c-1"])).toEqual([]);
      const late = "2026-11-26T10:30:00.000Z";
      expect(await routeAfter(fakeApi([mention]).api, ["c-1"], late)).toEqual([]);
      const own = { ...mention, authorAgentId: null, authorUserId: "user-board" };
      expect(await routeAfter(fakeApi([own]).api, ["c-1"])).toEqual([]);
    });

    it("answers newest first, from the last 14 days only, with `repliedAt: null`", async () => {
      const later = { ...mention, id: "c-4", createdAt: new Date("2026-11-26T11:30:00.000Z") };
      const old = { ...mention, id: "c-5", createdAt: new Date("2026-11-11T12:00:00.000Z") };
      const { api } = fakeApi([mention, later, old]);
      const answer = await routeAfter(api, ["c-1", "c-4", "c-5"], "2026-10-01T00:00:00.000Z");
      expect(answer.map((each) => [each["commentId"], each["repliedAt"]])).toEqual([
        ["c-4", null],
        ["c-1", null],
      ]);
    });

    it(`answers at most ${mostMentions} mentions`, async () => {
      const many = Array.from({ length: mostMentions + 1 }, (_, index) => ({
        ...mention,
        id: `c-many-${index}`,
        createdAt: new Date(now.getTime() - (index + 1) * 60_000),
      }));
      const { api } = fakeApi(many);
      const answer = await routeAfter(
        api,
        many.map((each) => each.id),
      );
      expect(answer).toHaveLength(mostMentions);
      expect(answer.at(-1)?.["commentId"]).toBe(`c-many-${mostMentions - 1}`);
    });

    it("leaves out a deleted comment", async () => {
      const { api } = fakeApi([mention]);
      const index = boardMentions(api);
      await index.onCommentCreated(commented("c-1"), now);
      const deleted = { ...mention, body: "", deletedAt: new Date("2026-11-26T11:00:00.000Z") };
      api.issues.listComments = async () => [deleted] as never;
      const answer = await handleBoardMentions(mentionsRequest(boardActor), api, now);
      expect(answer.body).toEqual({ mentions: [] });
    });

    it(`keeps at most ${mostIdsPerComment} people per comment, and reads long text in linear time`, () => {
      const links = Array.from({ length: 50 }, (_, index) => `[P](user://user-${index})`).join(" ");
      expect(mentionedUserIds(links)).toHaveLength(mostIdsPerComment);
      // A pattern that backtracks on a run of `[` takes minutes here and trips the test's timeout.
      expect(mentionedUserIds("[".repeat(1_000_000))).toEqual([]);
    });

    it("is declared board only and refuses an agent's key", async () => {
      const route = manifest.apiRoutes?.find((each) => each.path === "/board/mentions");
      expect([route?.routeKey, route?.method, route?.auth]).toEqual([
        boardMentionsRouteKey,
        "GET",
        "board",
      ]);
      const { api } = fakeApi([mention]);
      const answer = await handleBoardMentions(mentionsRequest(agentActor), api, now);
      expect(answer.status).toBe(403);
    });

    it("logs a comment it couldn't read, and throws nothing", async () => {
      const { api, errors } = fakeApi([]);
      api.issues.listComments = async () => {
        throw new Error("down");
      };
      await boardMentions(api).onCommentCreated(commented("c-1"), now);
      expect(errors).toHaveLength(1);
    });
  });
});
