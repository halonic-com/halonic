import { type Infer, type Schema, s } from "@halonicjs/schema-kit";
import type { RequestContext, ServerPorts } from "./api.ts";
import { errorResponse, serverErrors } from "./errors.ts";
import { readMessagingBody } from "./messaging-wire.ts";
import type { PaperclipKeyPorts } from "./paperclip-key-api.ts";
import { isJsonRequest } from "./run-routes.ts";
import { thisComputerSession } from "./sign-in.ts";

/** The address of every Paperclip key route: `/api/paperclip/<call>`. */
export const paperclipKeyPathPrefix = "/api/paperclip/";

/** A connection's name: its file name without `.yaml`, as the desktop host allows it. */
const connection = s.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u);
const signInId = s.string().min(1).max(64);

const bodies = {
  start: s
    .object({ address: s.string().min(1).max(2048), connection: connection.optional() })
    .strict(),
  signIn: s.object({ signInId }).strict(),
  disconnect: s.object({ connection }).strict(),
} as const;

/**
 * One request to a Paperclip key route, from a signed-in person. The context
 * and the session are there for a gate around a route, such as one that asks
 * for the password again and records which device made the change.
 */
export interface PaperclipKeyCall {
  readonly request: Request;
  readonly context: RequestContext;
  readonly body: Uint8Array;
  readonly session: string;
}

/** A Paperclip key route: its work on a call whose body is still unread. */
export type PaperclipKeyRoute = (call: PaperclipKeyCall) => Promise<Response>;

/** Runs `run` on the call's body when it fits `schema`; else 400, and the port hears nothing. */
function withBody<S extends Schema>(
  schema: S,
  run: (body: Infer<S>) => Promise<unknown>,
): PaperclipKeyRoute {
  return async (call) => {
    const body = readMessagingBody(schema, call.body);
    return body === null ? errorResponse(serverErrors.badRequest) : Response.json(await run(body));
  };
}

/**
 * The routes by call: sign in to Paperclip (`sign-in/start`, `sign-in/poll`,
 * `sign-in/cancel`), and `disconnect`. The ones that put a key in the store or
 * take it out are `sign-in/poll` and `disconnect`; `sign-in/cancel` may undo a
 * key nobody holds.
 */
function routesOf(port: PaperclipKeyPorts): Readonly<Record<string, PaperclipKeyRoute>> {
  return {
    "sign-in/start": withBody(bodies.start, (body) => port.start(body)),
    "sign-in/poll": withBody(bodies.signIn, ({ signInId }) => port.poll(signInId)),
    "sign-in/cancel": withBody(bodies.signIn, ({ signInId }) => port.cancel(signInId)),
    disconnect: withBody(bodies.disconnect, ({ connection }) => port.disconnect(connection)),
  };
}

/** The Paperclip key routes as the server mounts them, behind the security layer and the daily ceiling. */
export interface PaperclipKeyRoutes {
  /**
   * Answers `/api/paperclip/<call>`. `session` is the request's session as
   * the sign-in gives it, `null` when it has none.
   */
  handle(
    request: Request,
    context: RequestContext,
    body: Uint8Array,
    call: string,
    session: string | null,
  ): Promise<Response>;
}

/**
 * The routes Studio's Connect dialog signs the server in to Paperclip with,
 * and Disconnect (`server.paperclip-sign-in`). Every one is a `POST` with a
 * JSON body, and the checks run in a fixed order, none up to the body reading
 * it: a session of a person who signed in (401; as for the messaging routes, a
 * server with no password treats no request as signed in), the route (404), a
 * JSON body (415), then the body (400). No answer holds a key. A failure is
 * 502 `paperclip_sign_in_failed`, and the error log gets only the call and
 * the error's name, since a message could quote Paperclip's answer.
 */
export function createPaperclipKeyRoutes(
  port: PaperclipKeyPorts,
  { errorLog }: Pick<ServerPorts, "errorLog">,
): PaperclipKeyRoutes {
  const routes = routesOf(port);

  async function handle(
    request: Request,
    context: RequestContext,
    body: Uint8Array,
    call: string,
    session: string | null,
  ): Promise<Response> {
    if (session === null || session === thisComputerSession) {
      return errorResponse(serverErrors.notSignedIn);
    }
    const route = Object.hasOwn(routes, call) ? routes[call] : undefined;
    if (route === undefined || request.method !== "POST") {
      return errorResponse(serverErrors.notFound);
    }
    if (!isJsonRequest(request)) {
      return errorResponse(serverErrors.unsupportedMediaType);
    }
    try {
      return await route({ request, context, body, session });
    } catch (cause) {
      const name = cause instanceof Error ? cause.name : typeof cause;
      errorLog.record(new Error(`Paperclip sign-in failed at ${call}: ${name}`));
      return errorResponse(serverErrors.paperclipSignInFailed);
    }
  }

  return { handle };
}
