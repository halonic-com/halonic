import { type Infer, type Schema, s } from "@halonicjs/schema-kit";
import type { RequestContext, ServerPorts } from "./api.ts";
import { sessionHolder } from "./device-sign-in.ts";
import { errorResponse, serverErrors } from "./errors.ts";
import { readMessagingBody } from "./messaging-wire.ts";
import type { PaperclipKeyPorts } from "./paperclip-key-api.ts";
import {
  claimConnected,
  type KeyChange,
  recordKeyChange,
  rememberSignIn,
} from "./paperclip-key-changes.ts";
import { checkPasswordAgain } from "./password-again.ts";
import { isJsonRequest } from "./run-routes.ts";
import { passwordSecretName, thisComputerSession } from "./sign-in.ts";

/** The address of every Paperclip key route: `/api/paperclip-keys/<call>`. */
export const paperclipKeyPathPrefix = "/api/paperclip-keys/";

/** A connection's name: its file name without `.yaml`, as the desktop host allows it. */
const connection = s.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u);
const signInId = s.string().min(1).max(64);
/** The `serve-password`, asked for again, as "Add a device" takes it. */
const password = s.string().min(1).max(1024);

const bodies = {
  start: s
    .object({
      address: s.string().min(1).max(2048),
      connection: connection.optional(),
      password,
    })
    .strict(),
  signIn: s.object({ signInId }).strict(),
  disconnect: s.object({ connection, password }).strict(),
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

type KeyRoutePorts = Pick<
  ServerPorts,
  "errorLog" | "secrets" | "passwordHasher" | "coordination" | "clock"
>;

/** Runs `run` on the call's body when it fits `schema`; else 400, and the port hears nothing. */
function withBody<S extends Schema>(
  schema: S,
  run: (body: Infer<S>, call: PaperclipKeyCall) => Promise<unknown>,
): PaperclipKeyRoute {
  return async (call) => {
    const body = readMessagingBody(schema, call.body);
    return body === null
      ? errorResponse(serverErrors.badRequest)
      : Response.json(await run(body, call));
  };
}

/**
 * {@link withBody} for a route that changes the stored key: `run` runs only when the body's
 * `password` is the current `serve-password`, through the check "Add a device" uses, its login
 * limit included (`server.paperclip-key-password`). The body is read first, so one that doesn't
 * fit is refused before the password counts as a try; the password is checked before the port
 * hears anything, so a wrong one gets the same answer whatever is stored. `run` never sees it.
 */
function withPassword<S extends Schema<{ password: string }>>(
  ports: KeyRoutePorts,
  schema: S,
  run: (body: Omit<Infer<S>, "password">, call: PaperclipKeyCall) => Promise<unknown>,
): PaperclipKeyRoute {
  return async (call) => {
    const body = readMessagingBody(schema, call.body);
    if (body === null) {
      return errorResponse(serverErrors.badRequest);
    }
    const passwordHash = await ports.secrets.get(passwordSecretName);
    if (passwordHash === null) {
      return errorResponse(serverErrors.notSignedIn);
    }
    const { password, ...rest } = body;
    const refusal = await checkPasswordAgain(ports, call.context, password, passwordHash);
    return refusal ?? Response.json(await run(rest, call));
  };
}

/** The name of what was thrown, for the error log: a message could quote Paperclip's answer. */
function errorName(cause: unknown): string {
  return cause instanceof Error ? cause.name : typeof cause;
}

/**
 * The routes by call: sign in to Paperclip (`sign-in/start`, `sign-in/poll`,
 * `sign-in/cancel`), and `disconnect`. The ones that put a key in the store or
 * take it out are `sign-in/poll` and `disconnect`, and each records who did:
 * for a sign-in, the session that started it, once however often it is polled.
 * A sign-in starts only with the password, so no key is stored without it;
 * `sign-in/cancel` may undo a key nobody holds.
 */
function routesOf(
  port: PaperclipKeyPorts,
  ports: KeyRoutePorts,
): Readonly<Record<string, PaperclipKeyRoute>> {
  const { coordination } = ports;
  /**
   * Writes to the record after the key change it notes is done, so a failed write goes to the
   * error log and the route still answers what the port did.
   */
  const keepRecord = async (call: string, write: () => Promise<void>) => {
    try {
      await write();
    } catch (cause) {
      ports.errorLog.record(
        new Error(`Paperclip key record failed at ${call}: ${errorName(cause)}`),
      );
    }
  };
  const record = (connection: string, change: KeyChange["change"], by: string) =>
    recordKeyChange(ports, { connection, change, by });
  return {
    "sign-in/start": withPassword(ports, bodies.start, async (body, call) => {
      const started = await port.start(body);
      if (started.outcome === "started") {
        await keepRecord("sign-in/start", () =>
          rememberSignIn(coordination, started.signInId, sessionHolder(call.session)),
        );
      }
      return started;
    }),
    "sign-in/poll": withBody(bodies.signIn, async ({ signInId }, call) => {
      const state = await port.poll(signInId);
      if (state.status === "connected") {
        await keepRecord("sign-in/poll", async () => {
          const by = await claimConnected(coordination, signInId, sessionHolder(call.session));
          if (by !== null) await record(state.connection, "connected", by);
        });
      }
      return state;
    }),
    "sign-in/cancel": withBody(bodies.signIn, ({ signInId }) => port.cancel(signInId)),
    disconnect: withPassword(ports, bodies.disconnect, async ({ connection }, call) => {
      const done = await port.disconnect(connection);
      if (done.outcome === "disconnected") {
        await keepRecord("disconnect", () =>
          record(connection, "disconnected", sessionHolder(call.session)),
        );
      }
      return done;
    }),
  };
}

/** The Paperclip key routes as the server mounts them, behind the security layer and the daily ceiling. */
export interface PaperclipKeyRoutes {
  /**
   * Answers `/api/paperclip-keys/<call>`. `session` is the request's session as
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
 * the error's name, since a message could quote Paperclip's answer. A failed
 * write to the record of who changed a key only goes to the error log: the key
 * is stored or removed by then, so the answer says so.
 */
export function createPaperclipKeyRoutes(
  port: PaperclipKeyPorts,
  ports: KeyRoutePorts,
): PaperclipKeyRoutes {
  const { errorLog } = ports;
  const routes = routesOf(port, ports);

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
      errorLog.record(new Error(`Paperclip sign-in failed at ${call}: ${errorName(cause)}`));
      return errorResponse(serverErrors.paperclipSignInFailed);
    }
  }

  return { handle };
}
