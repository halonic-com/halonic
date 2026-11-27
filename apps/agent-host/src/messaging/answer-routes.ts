import type { ServerResponse } from "node:http";
import { readInboxAnswer } from "@halonicjs/host-server";
import type { AnswerResult, InboxAnswer, InboxItem } from "@halonicjs/ports";
import { type Schema, s } from "@halonicjs/schema-kit";
import { type HostRoute, sendError, sendJson } from "../server/host-server.ts";
import { readCheckedBody } from "../server/json-body.ts";
import {
  answerDigest,
  confirmationOf,
  needsConfirmation,
  offeredOption,
} from "./answer-confirmation.ts";
import type { DesktopMessaging } from "./desktop-messaging.ts";
import type { WorkspaceMessaging } from "./workspace-messaging.ts";

const workspace = s.string().min(1).max(4096);
const id = s.string().min(1).max(1024);
// Any answer the port takes, read as the server engine reads it, so Submit's `answers` and a
// stepper's `action-result` reach the source too (HAL-19350). Whether it fits the item, the port decides.
const answerBody = s.object({ workspace, item: id, answer: s.unknown() }).strict();
const confirmedBody = s
  .object({ workspace, item: id, answer: s.unknown(), digest: s.string().regex(/^[0-9a-f]{64}$/) })
  .strict();

/** What the answer routes reach. */
export interface AnswerRouteDeps {
  messaging: DesktopMessaging;
  /** Where the host writes what failed; never a key. */
  log: (text: string) => void;
}

/** The answer the host sends, or the refusal it answers. */
type Outcome =
  | { status: 200; result: AnswerResult }
  | { status: 409; kind: "needs_confirmation" | "item_changed"; body?: object };

/**
 * The two routes that answer an inbox item (`agent-host.messaging-answer-route`,
 * `agent-host.risky-answer-confirm`), whichever engine serves the workspace:
 *
 * - `POST /v1/messaging/answer` with `{ item, answer }` answers `{ result }`. An answer that
 *   approves or accepts a risky item is 409 `needs_confirmation` instead, sending nothing, with
 *   `confirmation`: the host's own copy of the item for Studio's shell to show, and its digest.
 * - `POST /v1/messaging/answer-confirmed` with `{ item, answer, digest }`, which only the shell
 *   sends after the person's yes, sends the answer only while the item and the answer still give
 *   `digest`; otherwise it is 409 `item_changed` and sends nothing.
 *
 * Both read the item again from the workspace's messaging first; an item it no longer lists is
 * refused with `not-found`, unsent.
 */
export function answerRoutes(deps: AnswerRouteDeps): HostRoute[] {
  const route = <T extends { workspace: string; item: string; answer: unknown }>(
    path: string,
    schema: Schema<T>,
    digestOf: (body: T) => string | undefined,
  ): HostRoute => ({
    method: "POST",
    path,
    handle: async (request, response) => {
      const body = await readCheckedBody(request, response, schema);
      if (body === undefined) return;
      try {
        const messaging = await deps.messaging.of(body.workspace);
        if (messaging === undefined) {
          sendError(response, 404, "unknown_workspace", "The host serves no such workspace.");
          return;
        }
        send(response, await answerOnce(messaging, body.item, body.answer, digestOf(body)));
      } catch (error) {
        deps.log(`Agent messaging failed at ${path}: ${describe(error)}\n`);
        sendError(response, 502, "messaging_failed", "The agents' sources couldn't be read.");
      }
    },
  });
  return [
    route("/v1/messaging/answer", answerBody, () => undefined),
    route("/v1/messaging/answer-confirmed", confirmedBody, (body) => body.digest),
  ];
}

/**
 * Answers `item` once with `rawAnswer`, after the item read again. With a `digest`, which only the
 * shell's confirmed send carries, any answer goes only while the item and the answer still give
 * that digest; without one, an answer that needs the person's yes isn't sent.
 */
async function answerOnce(
  messaging: WorkspaceMessaging,
  item: string,
  rawAnswer: unknown,
  digest: string | undefined,
): Promise<Outcome> {
  const answer: InboxAnswer | null = readInboxAnswer(rawAnswer);
  if (answer === null) return refused("bad-answer");
  const found = await freshItem(messaging, item, digest !== undefined);
  if (found === undefined) return refused("not-found");
  // An option the item doesn't offer never reaches the shell's dialog, so no page text does.
  const unoffered = answer.kind === "option" && offeredOption(found, answer.option) === undefined;
  if (unoffered && needsConfirmation(found, answer)) return refused("bad-answer");
  if (digest !== undefined && digest !== answerDigest(found, answer)) {
    return { status: 409, kind: "item_changed" };
  }
  if (digest === undefined && needsConfirmation(found, answer)) {
    return {
      status: 409,
      kind: "needs_confirmation",
      body: { confirmation: confirmationOf(found, answer) },
    };
  }
  return { status: 200, result: await messaging.messaging.answer(found.id, answer) };
}

/**
 * The workspace's item `item`. The sources' local copy can lag behind them: an agent can resubmit
 * an approval with new variables after a revision request. So for a confirmed send, or an item the
 * copy holds as anything but `normal`, the host first reads the item's source again with a read
 * that starts now, and the person confirms, and the source gets, what the source holds now. When
 * that read fails it throws, so the route answers 502 and sends nothing rather than trust the copy.
 */
async function freshItem(
  messaging: WorkspaceMessaging,
  item: string,
  confirmed: boolean,
): Promise<InboxItem | undefined> {
  const find = async () =>
    (await messaging.messaging.listInboxItems()).find((each) => each.id === item);
  const stored = await find();
  const normal = stored !== undefined && (stored.risk === undefined || stored.risk === "normal");
  if (!confirmed && (stored === undefined || normal)) return stored;
  await messaging.refreshSourceOf(item);
  return find();
}

function refused(reason: "bad-answer" | "not-found"): Outcome {
  return { status: 200, result: { outcome: "refused", reason } };
}

const refusalText = {
  needs_confirmation: "Approving this needs your yes in Studio's own window.",
  item_changed: "This changed since you confirmed it, so nothing was sent.",
} as const;

function send(response: ServerResponse, outcome: Outcome): void {
  if (outcome.status === 200) {
    sendJson(response, 200, { result: outcome.result });
    return;
  }
  const error = { kind: outcome.kind, message: refusalText[outcome.kind] };
  sendJson(response, 409, { error, ...outcome.body });
}

/** The error's name and message: the client's errors name the request and status only, never a key. */
function describe(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : "an unknown error";
}
