import type { Clock, Coordination, Secrets } from "@halonicjs/ports";
import { createDevicePairing } from "./device-pairing.ts";
import { fieldPatterns } from "./device-routes.ts";
import { createDeviceSessions } from "./device-sessions.ts";
import { passwordSecretName } from "./sign-in.ts";

/**
 * The console half of `server.device-pairing`: what `halonic serve pair` and `halonic serve
 * devices` ask the running server for. It is answered only on the console channel, which only
 * the user who runs the server can open, never over HTTP, so it needs no password: every Allow
 * it gives is by `console`. It never hands out a session token; only the device that polls its
 * pending ID gets one.
 */
export type ConsoleRequest =
  | { readonly op: "code" }
  /** The request made with `code`, which `halonic serve pair` got from `code` and shows. */
  | { readonly op: "waiting"; readonly code: string }
  | { readonly op: "allow"; readonly requestId: string }
  | { readonly op: "devices" }
  | { readonly op: "revoke"; readonly deviceId: string };

/** Why the console refused a request. */
export type ConsoleRefusal =
  /** No `serve-password` is set, so there are no devices to pair. */
  | "no-password"
  /** No waiting request or live device has that id. */
  | "not-found"
  /** The request isn't one of {@link ConsoleRequest}. */
  | "bad-request";

/** The console's answer: the operation's fields with `ok: true`, or `ok: false` and why it refused. */
export interface ConsoleReply {
  readonly ok: boolean;
  readonly reason?: ConsoleRefusal;
  readonly [field: string]: unknown;
}

/** The console's side of the channel. */
export interface DeviceConsole {
  /** Answers one request, as it came off the channel; anything else is a `bad-request`. */
  answer(request: unknown): Promise<ConsoleReply>;
}

type ConsolePorts = {
  readonly coordination: Coordination;
  readonly clock: Clock;
  readonly secrets: Pick<Secrets, "get">;
};

/**
 * The console over the same `coordination` as the server's routes, so a device the console
 * allows signs in to that server and a device it revokes is signed out there.
 */
export function createDeviceConsole(ports: ConsolePorts): DeviceConsole {
  const devices = createDeviceSessions(ports);
  const pairing = createDevicePairing(ports, devices);

  async function answerWith(request: ConsoleRequest, passwordHash: string): Promise<ConsoleReply> {
    switch (request.op) {
      case "code":
        return { ok: true, ...(await pairing.newCode(passwordHash)) };
      case "waiting":
        return { ok: true, waiting: await pairing.waiting(passwordHash, request.code) };
      case "allow":
        return (await pairing.allow(request.requestId, "console", passwordHash))
          ? { ok: true }
          : { ok: false, reason: "not-found" };
      case "devices":
        return { ok: true, devices: await devices.list(passwordHash) };
      case "revoke": {
        const result = await devices.revoke(request.deviceId, passwordHash);
        return result.revoked
          ? { ok: true, allowedDevices: result.allowedDevices }
          : { ok: false, reason: "not-found" };
      }
    }
  }

  return {
    async answer(raw) {
      const request = consoleRequestOf(raw);
      if (request === null) {
        return { ok: false, reason: "bad-request" };
      }
      // Read on every request, so a new password ends the codes and devices as it does on HTTP.
      const passwordHash = await ports.secrets.get(passwordSecretName);
      return passwordHash === null
        ? { ok: false, reason: "no-password" }
        : answerWith(request, passwordHash);
    },
  };
}

/** `raw` as a {@link ConsoleRequest}, or `null` when it is none: no other field is read. */
function consoleRequestOf(raw: unknown): ConsoleRequest | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }
  const fields = raw as Record<string, unknown>;
  const op = fields["op"];
  const field = typeof op === "string" && Object.hasOwn(opFields, op) ? opFields[op] : undefined;
  // An unknown operation, or any field the operation doesn't take, refuses the whole request.
  const names = Object.keys(fields);
  if (field === undefined || names.length !== (field === null ? 1 : 2)) {
    return null;
  }
  if (field === null) {
    return { op } as ConsoleRequest;
  }
  const value = fields[field];
  return typeof value === "string" && fieldPatterns[field].test(value)
    ? ({ op, [field]: value } as ConsoleRequest)
    : null;
}

/** The one field each operation takes besides `op`, or `null` for none. */
const opFields: Readonly<Record<string, "code" | "requestId" | "deviceId" | null>> = {
  code: null,
  devices: null,
  waiting: "code",
  allow: "requestId",
  revoke: "deviceId",
};
