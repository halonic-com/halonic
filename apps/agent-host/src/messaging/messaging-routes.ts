import type { ServerResponse } from "node:http";
import type { SyncScheduler } from "@halonicjs/host-paperclip-sync";
import { readInboxAnswer } from "@halonicjs/host-server";
import {
  type AgentMessaging,
  type AnswerResult,
  type AttachmentRead,
  reactionEmoji,
  type TeamRunsQuery,
} from "@halonicjs/ports";
import { type Infer, type Schema, s } from "@halonicjs/schema-kit";
import { paperclipConnectionNamePattern } from "../paperclip/paperclip-key-routes.ts";
import { type HostRoute, sendError, sendJson } from "../server/host-server.ts";
import { readCheckedBody } from "../server/json-body.ts";
import type { DesktopMessaging } from "./desktop-messaging.ts";
import type { ReplyWatch } from "./reply-watch.ts";
import { serverEngineMessage } from "./server-engine.ts";
import type { WorkspaceMessaging } from "./workspace-messaging.ts";

const workspace = s.string().min(1).max(4096);
const id = s.string().min(1).max(1024);

const readBody = s
  .object({
    workspace,
    list: s.enum(["sources", "agents", "conversations", "messages", "inbox", "work", "search"]),
    conversation: id.optional(),
    text: s.string().max(1024).optional(),
  })
  .strict();

// Any answer the port takes, read as the server engine reads it, so Submit's `answers` and a
// stepper's `action-result` reach the source too (HAL-19350). Whether it fits the item, the port decides.
const answerBody = s.object({ workspace, item: id, answer: s.unknown() }).strict();

const sendBody = s
  .object({ workspace, conversation: id, body: s.string().min(1).max(20_000) })
  .strict();
const attachmentBody = s.object({ workspace, attachment: id }).strict();
const changesBody = s
  .object({ workspace, after: s.number().int().min(0), wait: s.boolean().optional() })
  .strict();
const focusBody = s.object({ inFront: s.boolean() }).strict();
const connectionsBody = s.object({ workspace }).strict();
/** A time with its zone, as `toISOString` writes it: the bound of today's finished runs. */
const isoTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
const runsBody = s
  .object({ workspace, agent: id.optional(), since: s.string().regex(isoTime).optional() })
  .strict();
const reactionsBody = s.object({ workspace, conversation: id }).strict();
const reactBody = s
  .object({ workspace, message: id, emoji: s.enum([...reactionEmoji]), on: s.boolean() })
  .strict();
const disconnectBody = s
  .object({ workspace, connection: s.string().regex(paperclipConnectionNamePattern) })
  .strict();

/** What the messaging routes reach. */
export interface MessagingRouteDeps {
  messaging: DesktopMessaging;
  /** When the sync polls: a send and Studio's focus change it. */
  sync: SyncScheduler;
  /** The conversations a send waits on, which make the sync poll every 5 seconds. */
  replies: ReplyWatch;
  /** Where the host writes what failed; never a key. */
  log: (text: string) => void;
}

type ReadBody = Infer<typeof readBody>;

/**
 * The desktop engine's `AgentMessaging` for Studio over loopback (ADR
 * 2026-11-24, agent messaging, deployment (a)). Every body names the
 * workspace by its real path; another folder is 404 `unknown_workspace`.
 *
 * - `POST /v1/messaging/read` with `{ list }` (and `conversation` for
 *   `messages`, `text` for `search`) answers `{ items }`.
 * - `POST /v1/messaging/answer` with `{ item, answer }`, any answer the port
 *   takes (an answer it doesn't is refused with `bad-answer`), and
 *   `POST /v1/messaging/send` with `{ conversation, body }` answer
 *   `{ result }`: the source answers or refuses, and offline nothing is kept
 *   to send later. A message sent makes the sync poll every 5 seconds
 *   while its conversation waits for the agent (`agent-host.paperclip-polling`).
 * - `POST /v1/messaging/attachment` with `{ attachment }` answers
 *   `{ result }`: the bytes as base64url with their type, or why they were
 *   refused (offline, the cache may not hold them).
 * - `POST /v1/messaging/changes` with `{ after }` answers `{ next, sources }`:
 *   the sources that changed since Studio's last look. With `wait: true` it
 *   answers as soon as one has, or with none after about 25 seconds: a long
 *   poll, so Studio hears of a change at once without asking every few seconds.
 * - `POST /v1/messaging/focus` with `{ inFront }` tells the sync whether
 *   Studio's window is open and in front, which sets how often it polls.
 * - `POST /v1/messaging/runs` with `{ agent?, since? }` answers `{ items }`:
 *   each source's `TeamRuns`, the live runs and the finished ones since
 *   `since`, kept in memory only (`agent-host.team-activity-routes`).
 * - `POST /v1/messaging/pull-requests` answers `{ items }`: each source's
 *   `PullRequestList`, under the team hub's freshness rules.
 * - `POST /v1/messaging/reactions` with `{ conversation }` and
 *   `POST /v1/messaging/react` with `{ message, emoji, on }` answer
 *   `{ result }`: a conversation's message reactions, or the person's own
 *   added or removed (`agent-host.message-reactions-routes`). A source that
 *   keeps none answers `not-supported`.
 * - `POST /v1/paperclip/connections` answers `{ workspace, connections }`:
 *   the workspace's real path, as the host binds keys to it, and its
 *   connection files with their labels, addresses, companies and states,
 *   for Settings › Connections and Studio's restore of a saved sign-in. No key.
 * - `POST /v1/paperclip/disconnect` with `{ connection }` revokes the key,
 *   then forgets it and deletes the cache even if the revoke failed, in this
 *   workspace and every other one that holds the same key, and answers
 *   `{ revoked }`. While the workspace's messaging engine is a server it is
 *   409 `server_engine` (`agent-host.messaging-engine`).
 *
 * A read that fails for every source is 502 `messaging_failed` with no
 * detail; the log says which error it was.
 */
export function messagingRoutes(deps: MessagingRouteDeps): HostRoute[] {
  const route = <T>(
    path: string,
    schema: Schema<T>,
    run: (body: T, response: ServerResponse) => Promise<void>,
  ): HostRoute => ({
    method: "POST",
    path,
    handle: async (request, response) => {
      const body = await readCheckedBody(request, response, schema);
      if (body === undefined) return;
      try {
        await run(body, response);
      } catch (error) {
        deps.log(`Agent messaging failed at ${path}: ${describe(error)}\n`);
        sendError(response, 502, "messaging_failed", "The agents' sources couldn't be read.");
      }
    },
  });
  const inWorkspace = <T extends { workspace: string }>(
    path: string,
    schema: Schema<T>,
    run: (messaging: WorkspaceMessaging, body: T) => Promise<unknown>,
  ) =>
    route<T>(path, schema, async (body, response) => {
      const messaging = await deps.messaging.of(body.workspace);
      if (messaging === undefined) {
        sendError(response, 404, "unknown_workspace", "The host serves no such workspace.");
        return;
      }
      sendJson(response, 200, await run(messaging, body));
    });
  return [
    inWorkspace("/v1/messaging/read", readBody, async (messaging, body) => ({
      items: await readList(messaging.messaging, body),
    })),
    inWorkspace("/v1/messaging/runs", runsBody, async (messaging, body) => ({
      items: await messaging.activity.runs(runsQueryOf(body)),
    })),
    inWorkspace("/v1/messaging/pull-requests", connectionsBody, async (messaging) => ({
      items: await messaging.activity.pullRequests(),
    })),
    inWorkspace("/v1/messaging/reactions", reactionsBody, async (messaging, body) => ({
      result: await messaging.reactions.list(body.conversation),
    })),
    inWorkspace("/v1/messaging/react", reactBody, async (messaging, body) => ({
      result: await messaging.reactions.react(body.message, body.emoji, body.on),
    })),
    inWorkspace("/v1/messaging/answer", answerBody, async (messaging, body) => {
      const answer = readInboxAnswer(body.answer);
      return {
        result:
          answer === null
            ? ({ outcome: "refused", reason: "bad-answer" } satisfies AnswerResult)
            : await messaging.messaging.answer(body.item, answer),
      };
    }),
    inWorkspace("/v1/messaging/send", sendBody, async (messaging, body) => {
      const result = await messaging.messaging.send(body.conversation, body.body);
      if (result.outcome === "sent") {
        deps.replies.watch(messaging.messaging, body.conversation);
        await deps.sync.expectReply();
      }
      return { result };
    }),
    inWorkspace("/v1/messaging/attachment", attachmentBody, async (messaging, body) => ({
      result: attachmentAnswer(await messaging.messaging.readAttachment(body.attachment)),
    })),
    route("/v1/messaging/changes", changesBody, async (body, response) => {
      const messaging = await deps.messaging.of(body.workspace);
      if (messaging === undefined) {
        sendError(response, 404, "unknown_workspace", "The host serves no such workspace.");
        return;
      }
      if (body.wait !== true) {
        sendJson(response, 200, messaging.changesSince(body.after));
        return;
      }
      // A caller that goes away (Studio closed the chat or quit) stops waiting at once.
      const gone = new AbortController();
      response.once("close", () => gone.abort());
      const changes = await messaging.waitForChanges(body.after, gone.signal);
      if (!response.writableEnded && !response.destroyed) sendJson(response, 200, changes);
    }),
    inWorkspace("/v1/paperclip/connections", connectionsBody, async (messaging) => ({
      workspace: messaging.workspace,
      connections: await messaging.connections(),
    })),
    route("/v1/paperclip/disconnect", disconnectBody, async (body, response) => {
      if (await deps.messaging.usesServer(body.workspace)) {
        sendError(response, 409, "server_engine", serverEngineMessage);
        return;
      }
      const disconnected = await deps.messaging.disconnect(body.workspace, body.connection);
      if (disconnected === undefined) {
        sendError(response, 404, "unknown_workspace", "The host serves no such workspace.");
        return;
      }
      sendJson(response, 200, disconnected);
    }),
    route("/v1/messaging/focus", focusBody, async (body, response) => {
      await deps.sync.setWindowOpen(body.inFront);
      sendJson(response, 200, {});
    }),
  ];
}

/** The port's runs query, without a field the body left out. */
function runsQueryOf(body: Infer<typeof runsBody>): TeamRunsQuery {
  return {
    ...(body.agent === undefined ? {} : { agent: body.agent }),
    ...(body.since === undefined ? {} : { since: body.since }),
  };
}

/** One of the port's lists; `messages` without a conversation and `search` without text are empty. */
function readList(messaging: AgentMessaging, body: ReadBody): Promise<readonly unknown[]> {
  switch (body.list) {
    case "sources":
      return messaging.listSources();
    case "agents":
      return messaging.listAgents();
    case "conversations":
      return messaging.listConversations();
    case "messages":
      return body.conversation === undefined
        ? Promise.resolve([])
        : messaging.listMessages(body.conversation);
    case "inbox":
      return messaging.listInboxItems();
    case "work":
      return messaging.listWork();
    case "search":
      return body.text === undefined ? Promise.resolve([]) : messaging.search(body.text);
  }
}

/** The error's name and message: the client's errors name the request and status only, never a key. */
function describe(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : "an unknown error";
}

/** An attachment's read as JSON: its bytes as base64url, which an answer body can carry. */
function attachmentAnswer(read: AttachmentRead) {
  if (read.outcome === "refused") return read;
  return {
    outcome: "read",
    type: read.type,
    base64url: Buffer.from(read.bytes).toString("base64url"),
  };
}
