import { verifies } from "@halonicjs/testing-spec";
import type { PluginApiRequestInput, PluginEvent } from "@paperclipai/plugin-sdk";
import { expect, test } from "vitest";
import { checkerTask, fakeBoardContext } from "./board-check.test-helper.ts";
import { boardCheck } from "./board-check.ts";
import { commentEvent, fakeChiefLine, lineRequest } from "./chief-line.test-helper.ts";
import { handleChiefLineRequest } from "./chief-line.ts";
import { chiefLineRouteKeys as keys } from "./chief-line-settings.ts";
import { onChiefLineComment } from "./chief-line-signal.ts";
import { fakeHost, fakeState } from "./fake-host.test-helper.ts";
import {
  chatNotesRouteKey,
  handleChatNotes,
  isAutomaticNote,
  progressNotes,
  rememberNote,
  rememberProgressNote,
} from "./front-bot-notes.ts";
import { paperclipHost } from "./host.ts";
import { manifest } from "./manifest.ts";

const taskId = "0b5c2f9e-4d1a-4c3b-9a8e-1f2d3c4b5a69";
const note = { commentId: "note-1", runId: "run-1", at: "2026-11-26T14:03:01.000Z" };

function notesRequest(actor: PluginApiRequestInput["actor"], id = taskId, companyId = "acme") {
  return {
    routeKey: chatNotesRouteKey,
    method: "GET",
    path: `/chat-notes/${id}`,
    params: { taskId: id },
    query: { companyId },
    body: null,
    actor,
    companyId,
    headers: {},
  } as unknown as PluginApiRequestInput;
}

const board = {
  actorType: "user",
  actorId: "user-board",
  userId: "user-board",
} as PluginApiRequestInput["actor"];
const agent = {
  actorType: "agent",
  actorId: "agent-liam",
  agentId: "agent-liam",
} as PluginApiRequestInput["actor"];

verifies("paperclip.front-bot-own-comments", () => {
  test("the route lists a task's notes for a board user only, and none for another company", async () => {
    const { state } = fakeState();
    await rememberNote(state, "acme", taskId, note);
    expect(await handleChatNotes(notesRequest(board), { state })).toEqual({
      status: 200,
      body: { automaticNotes: [note], progressNotes: null },
    });
    expect((await handleChatNotes(notesRequest(agent), { state })).status).toBe(403);
    expect((await handleChatNotes(notesRequest(board, "../other"), { state })).status).toBe(404);
    expect(await handleChatNotes(notesRequest(board, taskId, "other-company"), { state })).toEqual({
      status: 200,
      body: { automaticNotes: [], progressNotes: null },
    });
  });

  test("a note is the bot's by its id, or by having no author and the prefix; a person typing it isn't", () => {
    const ids = new Set(["note-1"]);
    const authorless = { authorAgentId: null, authorUserId: null };
    expect(isAutomaticNote({ id: "note-1", ...authorless, body: "anything" }, ids)).toBe(true);
    expect(
      isAutomaticNote({ id: "c-2", ...authorless, body: "*Automatic note:* About PR #1." }, ids),
    ).toBe(true);
    const typed = {
      id: "c-3",
      authorAgentId: null,
      authorUserId: "user-board",
      body: "*Automatic note:* hi",
    };
    expect(isAutomaticNote(typed, ids)).toBe(false);
  });

  test("must-fail test 9: the chief line neither wakes nor signals for a note", async () => {
    const line = fakeChiefLine();
    await handleChiefLineRequest(lineRequest(keys.openThread, { caller: "sup" }), line.ctx);
    await handleChiefLineRequest(
      lineRequest(keys.subscribe, { caller: "sup", url: "https://hooks.acme.test/c" }),
      line.ctx,
    );
    const posted = line.addComment("issue-1", "*Automatic note:* About PR #6129.", null, null);
    await onChiefLineComment(line.ctx, commentEvent("issue-1", posted.id));
    expect(line.wakes).toEqual([]);
    expect(line.posts).toEqual([]);
  });

  test("must-fail test 9: the board check doesn't look at a note for a board ask", async () => {
    const asking = {
      id: "note-1",
      authorType: "system" as const,
      authorAgentId: null,
      createdAt: new Date("2026-11-25T20:58:00Z"),
      body: "This needs the board's yes on the card.",
    };
    const task = {
      id: "task-16003",
      identifier: "HAL-16003",
      status: "in_progress",
      assigneeAgentId: "agent-mateo",
      updatedAt: new Date("2026-11-25T20:58:00Z"),
    };
    const fake = fakeBoardContext({
      tasks: [checkerTask, task],
      comments: { "task-16003": [asking] },
      config: () => ({
        boardCheckWritesForVersion: manifest.version,
        boardCheckerTask: checkerTask.id,
      }),
    });
    await rememberNote(fake.ctx.state, "acme", "task-16003", note);
    const event = {
      eventId: "event-note",
      eventType: "issue.comment.created",
      occurredAt: "2026-11-25T21:00:00Z",
      entityId: "task-16003",
      entityType: "issue",
      companyId: "acme",
      payload: { issueId: "task-16003", commentId: "note-1" },
    } as PluginEvent;
    // The check doesn't run at all for a note: it never reads the task's comments.
    let listed = 0;
    const list = fake.ctx.issues.listComments;
    const ctx = {
      ...fake.ctx,
      issues: {
        ...fake.ctx.issues,
        listComments: (...args: Parameters<typeof list>) => {
          listed += 1;
          return list(...args);
        },
      },
    };
    await boardCheck(ctx).onCommentCreated(event, new Date("2026-11-25T21:00:00Z"));
    expect(listed).toBe(0);
    expect(fake.sent).toEqual([]);
    await boardCheck(ctx).onCommentCreated(
      { ...event, payload: { issueId: "task-16003", commentId: "c-2" } },
      new Date("2026-11-25T21:00:00Z"),
    );
    expect(listed).toBeGreaterThan(0);
  });

  test("must-fail test 9: the PR watcher doesn't count a note as a task comment", async () => {
    const { host } = fakeHost([], {
      "task-1": [
        {
          authorAgentId: null,
          authorUserId: null,
          createdAt: new Date("2026-11-26T14:03:01Z"),
          body: "*Automatic note:* About PR #6129.",
        },
        {
          authorAgentId: "agent-owen",
          authorUserId: null,
          createdAt: new Date("2026-11-26T14:05:00Z"),
          body: "Pushed.",
        },
      ],
    });
    const { state } = fakeState();
    const comments = await paperclipHost(host, "acme", state).comments("task-1");
    expect(comments.map((comment) => comment.body)).toEqual(["Pushed."]);
  });
});

verifies("paperclip.front-bot-progress-notes", () => {
  test("progress notes a day old are deleted from plugin state, not only hidden", async () => {
    const { state, saved } = fakeState();
    const at = new Date("2026-11-26T14:03:01.000Z");
    await rememberProgressNote(state, "acme", taskId, "run-1", {
      at: at.toISOString(),
      text: "Reading a file now.",
    });
    const hourLater = new Date(at.getTime() + 60 * 60_000);
    expect(await progressNotes(state, "acme", taskId, hourLater)).toMatchObject({ runId: "run-1" });
    expect(saved.size).toBe(1);
    const dayLater = new Date(at.getTime() + 24 * 60 * 60_000 + 1);
    expect(await progressNotes(state, "acme", taskId, dayLater)).toBeUndefined();
    expect(saved.size).toBe(0);
  });
});
