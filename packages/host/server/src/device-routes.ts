import type { RequestContext, ServerPorts } from "./api.ts";
import { createDevicePairing } from "./device-pairing.ts";
import type { DeviceSessions } from "./device-sessions.ts";
import { deviceSessionPrefix } from "./device-sign-in.ts";
import { errorResponse, serverErrors } from "./errors.ts";
import { isJsonRequest } from "./run-routes.ts";
import { countLoginAttempt, passwordSecretName, type SignIn, tooManyAttempts } from "./sign-in.ts";

/**
 * The fields of a JSON body the device routes read, each with the pattern its text must match.
 * The console channel reads `requestId` and `deviceId` with the same patterns.
 */
export const fieldPatterns = {
  code: /^[\w -]{1,32}$/,
  // No control or format characters (bidi or zero-width ones), so a name can't pass for another's.
  deviceName: /^[^\p{Cc}\p{Cf}]{1,80}$/u,
  pendingId: /^[0-9a-f]{64}$/,
  password: /^[\s\S]{1,1024}$/,
  requestId: /^[0-9a-f]{32}$/,
  deviceId: /^device_[0-9a-f]{24}$/,
} as const;

type Field = keyof typeof fieldPatterns;

/** The text fields asked for from a JSON body, or `null` when the body isn't JSON or one is missing or malformed. */
function readFields<Name extends Field>(
  call: DeviceCall,
  names: readonly Name[],
): Record<Name, string> | null {
  if (!isJsonRequest(call.request)) {
    return null;
  }
  try {
    const parsed = JSON.parse(new TextDecoder().decode(call.body)) as Record<
      string,
      unknown
    > | null;
    const fields = {} as Record<Name, string>;
    for (const name of names) {
      const value = parsed?.[name];
      if (typeof value !== "string" || !fieldPatterns[name].test(value)) return null;
      fields[name] = value;
    }
    return fields;
  } catch {
    return null;
  }
}

/** One request to a device route, on a server that has a password. */
interface DeviceCall {
  readonly request: Request;
  readonly context: RequestContext;
  readonly body: Uint8Array;
  readonly passwordHash: string;
}

/** The routes of `server.device-pairing`. */
export interface DeviceRoutes {
  /** Answers a device route, or gives `null` when the address is none of them. */
  route(request: Request, context: RequestContext, body: Uint8Array): Promise<Response | null>;
}

type DeviceRoutePorts = Pick<ServerPorts, "secrets" | "passwordHasher" | "coordination" | "clock">;

/**
 * Builds the device routes. A device pairs with `POST /api/pair`, collects its token with
 * `POST /api/pair/status` or cancels with `POST /api/pair/cancel`, signed in to none of them. The owner's routes need a session; making a code
 * and Allow also need the password again, so a device session alone can't add a device.
 */
export function createDeviceRoutes(
  ports: DeviceRoutePorts,
  signIn: SignIn,
  devices: DeviceSessions,
): DeviceRoutes {
  const pairing = createDevicePairing(ports, devices);

  /** A 429 when the client is over the login limit, after counting this attempt; else `null`. */
  async function overLimit(context: RequestContext): Promise<Response | null> {
    const attempt = await countLoginAttempt(ports.coordination, context);
    return attempt.allowed ? null : tooManyAttempts(attempt, ports.clock);
  }

  /** `POST /api/pair`: every try counts against the login limit before the code is checked. */
  async function pair(call: DeviceCall): Promise<Response> {
    const fields = readFields(call, ["code", "deviceName"]);
    if (fields === null) {
      return errorResponse(serverErrors.badRequest);
    }
    const refusal = await overLimit(call.context);
    if (refusal !== null) {
      return refusal;
    }
    const pending = await pairing.request(fields.code, fields.deviceName, call.passwordHash);
    return pending === null
      ? errorResponse(serverErrors.pairingCodeRefused)
      : Response.json(pending);
  }

  /**
   * `POST /api/pair/status`: what the request with this pending ID came to. A used or guessed
   * pending ID gets nothing (`server.device-pairing-answers`).
   */
  async function status(call: DeviceCall): Promise<Response> {
    const fields = readFields(call, ["pendingId"]);
    if (fields === null) {
      return errorResponse(serverErrors.badRequest);
    }
    const poll = await pairing.poll(fields.pendingId, call.passwordHash);
    switch (poll.kind) {
      case "unknown":
        return errorResponse(serverErrors.notFound);
      case "waiting":
        return Response.json({ state: "waiting", expiresAt: poll.expiresAt }, { status: 202 });
      case "ended":
        return Response.json({ state: poll.why });
      case "allowed":
        return Response.json({
          state: "allowed",
          token: poll.token,
          sessionEndsAt: poll.sessionEndsAt,
        });
    }
  }

  /** `POST /api/pair/cancel`: the device drops its own request, so Allow can't start a session. */
  async function cancel(call: DeviceCall): Promise<Response> {
    const fields = readFields(call, ["pendingId"]);
    if (fields === null) {
      return errorResponse(serverErrors.badRequest);
    }
    return (await pairing.cancel(fields.pendingId, call.passwordHash))
      ? new Response(null, { status: 204 })
      : errorResponse(serverErrors.notFound);
  }

  /** `GET /api/devices`: the live devices and the requests waiting for Allow. */
  async function list(call: DeviceCall): Promise<Response> {
    const [live, waiting] = await Promise.all([
      devices.list(call.passwordHash),
      pairing.waiting(call.passwordHash),
    ]);
    return Response.json({ devices: live, waiting });
  }

  /** `POST /api/devices/revoke`: ends one device and names the devices it allowed. */
  async function revoke(call: DeviceCall): Promise<Response> {
    const fields = readFields(call, ["deviceId"]);
    if (fields === null) {
      return errorResponse(serverErrors.badRequest);
    }
    const result = await devices.revoke(fields.deviceId, call.passwordHash);
    return result.revoked ? Response.json(result) : errorResponse(serverErrors.deviceNotFound);
  }

  /** `POST /api/devices/deny`: the owner refuses a waiting request, whose device then hears so. */
  async function deny(call: DeviceCall): Promise<Response> {
    const fields = readFields(call, ["requestId"]);
    if (fields === null) {
      return errorResponse(serverErrors.badRequest);
    }
    return (await pairing.deny(fields.requestId, call.passwordHash))
      ? new Response(null, { status: 204 })
      : errorResponse(serverErrors.notFound);
  }

  /**
   * `POST /api/devices/sign-out`: a device ends its own session, signed in with its own token; the
   * other devices stay signed in. A password session isn't a device, so it is refused.
   */
  async function signOut(call: DeviceCall, session: string): Promise<Response> {
    if (!session.startsWith(deviceSessionPrefix)) {
      return errorResponse(serverErrors.notADevice);
    }
    await devices.revoke(session.slice(deviceSessionPrefix.length), call.passwordHash);
    return new Response(null, { status: 204 });
  }

  /**
   * Runs `then` only when the body's `password` is the current one, checked like a sign-in:
   * counted against the login limit first, so a stolen device token can't guess it freely.
   */
  async function withPassword(
    call: DeviceCall,
    then: (fields: Record<string, string>) => Promise<Response>,
    asks: readonly Field[] = [],
  ): Promise<Response> {
    const fields = readFields(call, ["password", ...asks]);
    if (fields === null) {
      return errorResponse(serverErrors.badRequest);
    }
    const refusal = await overLimit(call.context);
    if (refusal !== null) {
      return refusal;
    }
    const isRight = await ports.passwordHasher.verify(fields.password, call.passwordHash);
    return isRight ? then(fields) : errorResponse(serverErrors.wrongPassword);
  }

  /** `POST /api/devices/allow`: the device whose session asks is the one that allowed. */
  async function allow(call: DeviceCall, session: string): Promise<Response> {
    const allowedBy = session.startsWith(deviceSessionPrefix)
      ? session.slice(deviceSessionPrefix.length)
      : "browser";
    return withPassword(
      call,
      async ({ requestId = "" }) =>
        (await pairing.allow(requestId, allowedBy, call.passwordHash))
          ? new Response(null, { status: 204 })
          : errorResponse(serverErrors.notFound),
      ["requestId"],
    );
  }

  /** The routes that need no session: only a pairing code or a pending ID. */
  const pairRoutes: Record<string, (call: DeviceCall) => Promise<Response>> = {
    "POST /api/pair": pair,
    "POST /api/pair/status": status,
    "POST /api/pair/cancel": cancel,
  };

  /** The owner's routes, for a request with a session. */
  const ownerRoutes: Record<string, (call: DeviceCall, session: string) => Promise<Response>> = {
    "GET /api/devices": list,
    "POST /api/devices/revoke": revoke,
    "POST /api/devices/code": (call) =>
      withPassword(call, async () => Response.json(await pairing.newCode(call.passwordHash))),
    "POST /api/devices/allow": allow,
    "POST /api/devices/deny": deny,
    "POST /api/devices/sign-out": signOut,
  };

  return {
    async route(request, context, body) {
      const endpoint = `${request.method} ${new URL(request.url).pathname}`;
      const pairRoute = pairRoutes[endpoint];
      const ownerRoute = ownerRoutes[endpoint];
      if (pairRoute === undefined && ownerRoute === undefined) {
        return null;
      }
      // Like the login: a server with no password has no devices to pair.
      const passwordHash = await ports.secrets.get(passwordSecretName);
      if (passwordHash === null) {
        return errorResponse(serverErrors.notFound);
      }
      const call = { request, context, body, passwordHash };
      if (pairRoute !== undefined) {
        return pairRoute(call);
      }
      const session = await signIn.session(request, context);
      if (session === null || ownerRoute === undefined) {
        return errorResponse(serverErrors.notSignedIn);
      }
      return ownerRoute(call, session);
    },
  };
}
