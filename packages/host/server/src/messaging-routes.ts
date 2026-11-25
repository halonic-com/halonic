import type { AgentMessaging, MessagingRefusal } from "@halonicjs/ports";
import type { Infer, Schema } from "@halonicjs/schema-kit";
import type { ServerPorts } from "./api.ts";
import { errorResponse, serverErrors } from "./errors.ts";
import { frame } from "./event-stream.ts";
import type { MessagingPorts } from "./messaging-api.ts";
import {
  attachmentAnswer,
  messagingBodies,
  readInboxAnswer,
  readMessagingBody,
  readOutgoingFiles,
  refusalResponse,
} from "./messaging-wire.ts";
import { isJsonRequest } from "./run-routes.ts";
import { thisComputerSession } from "./sign-in.ts";

/** The address of every messaging route: `/api/messaging/<call>`. */
export const messagingPathPrefix = "/api/messaging/";

/** At most this many writes per session in {@link writeWindowMs} (`server.messaging-rate`). */
const writesPerWindow = 30;
const writeWindowMs = 60 * 1000;
const writeCountKeyPrefix = "messaging-writes:";

/** One route: its method, whether it is a write that counts against the limit, and its work on the checked body. */
interface MessagingRoute {
  readonly method: "GET" | "POST";
  readonly write: boolean;
  run(body: Uint8Array): Promise<Response>;
}

/** What a call of the port answered: a refusal becomes the route's error, anything else is `{ result }`. */
function resultResponse(result: {
  readonly outcome: string;
  readonly reason?: MessagingRefusal;
}): Response {
  return result.outcome === "refused" && result.reason !== undefined
    ? refusalResponse(result.reason)
    : Response.json({ result });
}

/** A list read with no arguments, answered as `{ items }`. */
function list(read: () => Promise<readonly unknown[]>): MessagingRoute {
  return { method: "GET", write: false, run: async () => Response.json({ items: await read() }) };
}

/** A call whose arguments come as a JSON body; a body that doesn't fit is 400 and reaches nothing. */
function withBody<S extends Schema>(
  schema: S,
  write: boolean,
  run: (body: Infer<S>) => Promise<Response>,
): MessagingRoute {
  return {
    method: "POST",
    write,
    run: async (bytes) => {
      const body = readMessagingBody(schema, bytes);
      return body === null ? errorResponse(serverErrors.badRequest) : run(body);
    },
  };
}

/** One route per call of the port, plus `focus` for the poll loop. `changes` is the event stream, served on its own. */
function routesOf({ port, focus }: MessagingPorts): Readonly<Record<string, MessagingRoute>> {
  const bodies = messagingBodies;
  return {
    sources: list(() => port.listSources()),
    agents: list(() => port.listAgents()),
    conversations: list(() => port.listConversations()),
    "inbox-items": list(() => port.listInboxItems()),
    work: list(() => port.listWork()),
    channels: list(() => port.browseChannels()),
    messages: withBody(bodies.messages, false, async ({ conversation }) =>
      Response.json({ items: await port.listMessages(conversation) }),
    ),
    search: withBody(bodies.search, false, async ({ text }) =>
      Response.json({ items: await port.search(text) }),
    ),
    attachment: withBody(bodies.attachment, false, async ({ attachment }) => {
      const read = await port.readAttachment(attachment);
      return read.outcome === "read"
        ? resultResponse(attachmentAnswer(read))
        : resultResponse(read);
    }),
    answer: withBody(bodies.answer, true, async ({ item, answer }) => {
      const checked = readInboxAnswer(answer);
      if (checked === null) return errorResponse(serverErrors.badRequest);
      return resultResponse(await port.answer(item, checked));
    }),
    send: withBody(bodies.send, true, async ({ conversation, body, attachments, to }) => {
      const files = readOutgoingFiles(attachments);
      if (files === null) return errorResponse(serverErrors.badRequest);
      return resultResponse(
        await port.send(conversation, body, files, to === undefined ? {} : { to }),
      );
    }),
    "start-channel": withBody(bodies.startChannel, true, async ({ title, members, lead }) =>
      resultResponse(await port.startChannel(title, members, lead)),
    ),
    "set-members": withBody(bodies.setMembers, true, async ({ channel, members, lead }) =>
      resultResponse(await port.setMembers(channel, members, lead)),
    ),
    "join-channel": withBody(bodies.channel, true, async ({ channel }) =>
      resultResponse(await port.joinChannel(channel)),
    ),
    "leave-channel": withBody(bodies.channel, true, async ({ channel }) =>
      resultResponse(await port.leaveChannel(channel)),
    ),
    focus: withBody(bodies.focus, false, async ({ inFront }) => {
      focus.report(inFront);
      return new Response(null, { status: 204 });
    }),
  };
}

/**
 * What reaches the error log when the port fails: the call and the error's
 * name only. A provider's message or cause could quote a header or a body,
 * and a body can hold the text of a message (`server.messaging-routes`).
 */
function failureOf(call: string, cause: unknown): Error {
  const name = cause instanceof Error ? cause.name : typeof cause;
  return new Error(`Agent messaging failed at ${call}: ${name}`);
}

/**
 * `GET /api/messaging/changes`: the port's `changes` as server-sent events,
 * one `change` message with `{ source }` per source that changed. The stream
 * ends when the client goes away, and so does the port's reader.
 */
function streamChanges(
  port: AgentMessaging,
  request: Request,
  errorLog: ServerPorts["errorLog"],
): Response {
  const reader = port.changes()[Symbol.asyncIterator]();
  const encoder = new TextEncoder();
  const stop = () => void reader.return?.();
  request.signal.addEventListener("abort", stop, { once: true });
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await reader.next();
        if (next.done === true) {
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(frame("change", { source: next.value })));
      } catch (cause) {
        errorLog.record(failureOf("changes", cause));
        controller.close();
      }
    },
    cancel: stop,
  });
  return new Response(body, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "X-Accel-Buffering": "no" },
  });
}

/** The messaging routes as the server mounts them, behind the security layer and the daily ceiling. */
export interface MessagingRoutes {
  /**
   * Answers `/api/messaging/<call>`. `session` is the request's session as
   * the sign-in gives it, `null` when it has none.
   */
  handle(
    request: Request,
    body: Uint8Array,
    call: string,
    session: string | null,
  ): Promise<Response>;
}

/**
 * The messaging routes (`server.messaging-routes`). The checks run in a fixed
 * order, and none up to the body reads it: a session of a person who signed
 * in (401), the route (404), a JSON body for a `POST` (415), the write limit
 * for a write (429), then the body (400).
 *
 * A server with no password treats every loopback request as signed in, but
 * not here: a proxy on the same computer makes every outside request look
 * like loopback (`server.messaging-needs-session`).
 */
export function createMessagingRoutes(
  messaging: MessagingPorts,
  { coordination, clock, errorLog }: Pick<ServerPorts, "coordination" | "clock" | "errorLog">,
): MessagingRoutes {
  const routes = routesOf(messaging);

  /** Counts one write of the session; the 31st in a window is refused before the port hears of it. */
  async function refuseOverLimit(session: string): Promise<Response | null> {
    const count = await coordination.countInWindow(
      `${writeCountKeyPrefix}${session}`,
      writeWindowMs,
      writesPerWindow,
    );
    if (count.allowed) return null;
    const waitMs = Date.parse(count.resetAt) - clock.now().getTime();
    const retryAfter = String(Math.max(1, Math.ceil(waitMs / 1000)));
    return errorResponse(serverErrors.tooManyRequests, { "Retry-After": retryAfter });
  }

  /** The route a request may reach, or the refusal it gets first: no route (404) or no JSON body for a `POST` (415). */
  function routeFor(request: Request, call: string): MessagingRoute | Response {
    const route = Object.hasOwn(routes, call) ? routes[call] : undefined;
    if (route === undefined || route.method !== request.method) {
      return errorResponse(serverErrors.notFound);
    }
    if (route.method === "POST" && !isJsonRequest(request)) {
      return errorResponse(serverErrors.unsupportedMediaType);
    }
    return route;
  }

  /** Runs a route; a failure reaches the error log as {@link failureOf} gives it, and the caller gets a fixed 502. */
  async function run(route: MessagingRoute, call: string, body: Uint8Array): Promise<Response> {
    try {
      return await route.run(body);
    } catch (cause) {
      errorLog.record(failureOf(call, cause));
      return errorResponse(serverErrors.messagingFailed);
    }
  }

  async function handle(
    request: Request,
    body: Uint8Array,
    call: string,
    session: string | null,
  ): Promise<Response> {
    if (session === null || session === thisComputerSession) {
      return errorResponse(serverErrors.notSignedIn);
    }
    if (request.method === "GET" && call === "changes") {
      return streamChanges(messaging.port, request, errorLog);
    }
    const route = routeFor(request, call);
    if (route instanceof Response) {
      return route;
    }
    const overLimit = route.write ? await refuseOverLimit(session) : null;
    return overLimit ?? run(route, call, body);
  }

  return { handle };
}
