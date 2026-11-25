import type { Clock, Coordination } from "@halonicjs/ports";
import { pairingAlphabet } from "@halonicjs/ports";
import { constantTimeEqual, encodeUtf8 } from "@halonicjs/std";
import type { AllowedBy, DeviceSessions } from "./device-sessions.ts";
import { passwordFingerprint, sessionGenerationKey, sha256Hex, toHex } from "./stored-session.ts";
import { updateRecord } from "./versioned-record.ts";

/**
 * Pairing a device (requirement `server.device-pairing`): the owner makes a one-time code, the
 * device sends it and gets a pending ID and a check code, the owner allows the request that shows
 * the same check code, and the device collects its token once with the pending ID. Every waiting
 * code is kept in one `Coordination` value, so the owner can list the requests. A code belongs to
 * the password and the session generation it was made under, so a new password or revoking every
 * session also ends the codes and requests made before it.
 */
export const pairingKey = "devices:pairing";

const codeLength = 8;
const checkCodeLength = 6;
/** A code, and a request made with it, lasts this long. */
export const pairingLifetimeMs = 10 * 60 * 1000;

/** A request for a code, waiting for the owner. Only hashes of the code and the pending ID are kept. */
interface WaitingRequest {
  /** What the owner's Allow names: random, and no use to the device. */
  readonly id: string;
  readonly pendingHash: string;
  readonly deviceName: string;
  readonly checkCode: string;
  readonly expiresAt: string;
  readonly allowedBy?: AllowedBy;
}

interface StoredCode {
  readonly codeHash: string;
  readonly expiresAt: string;
  /** The fingerprint of the password hash it was made under. */
  readonly password: string;
  /** The session generation it was made in. */
  readonly generation: string | null;
  readonly request?: WaitingRequest;
}

/** The password fingerprint and session generation a code must match to stay live. */
interface Grant {
  readonly password: string;
  readonly generation: string | null;
}

/** A request the owner may allow, as a list shows it. */
export interface PairingRequestView {
  readonly id: string;
  readonly deviceName: string;
  readonly checkCode: string;
  readonly expiresAt: string;
}

/** What polling a pending ID found: still waiting, the token (given once), or nothing. */
export type PairingPoll =
  | { readonly kind: "waiting" }
  | { readonly kind: "allowed"; readonly token: string }
  | { readonly kind: "unknown" };

/** The pairing steps of one server. Every call takes the current `serve-password` hash. */
export interface DevicePairing {
  /** A new one-time code, for the owner to give to the device. */
  newCode(passwordHash: string): Promise<{ readonly code: string; readonly expiresAt: string }>;
  /**
   * A device's request with a code: its pending ID and check code, or `null` when the code isn't
   * a live, unused one. A second request with a code that has one waiting cancels both.
   */
  request(
    code: string,
    deviceName: string,
    passwordHash: string,
  ): Promise<{ pendingId: string; checkCode: string } | null>;
  /** The requests waiting for Allow. */
  waiting(passwordHash: string): Promise<readonly PairingRequestView[]>;
  /** Allows the waiting request with this id; `false` when there is none. */
  allow(requestId: string, allowedBy: AllowedBy, passwordHash: string): Promise<boolean>;
  /** Polls a pending ID; once allowed, starts the device's session and gives its token once. */
  poll(pendingId: string, passwordHash: string): Promise<PairingPoll>;
}

type PairingPorts = { readonly coordination: Coordination; readonly clock: Clock };

/** The pairing steps, kept in `ports.coordination`, that start sessions in `devices`. */
export function createDevicePairing(ports: PairingPorts, devices: DeviceSessions): DevicePairing {
  const { coordination, clock } = ports;
  const later = () => new Date(clock.now().getTime() + pairingLifetimeMs).toISOString();

  /** The current password fingerprint and session generation. */
  async function currentGrant(passwordHash: string): Promise<Grant> {
    const [password, generation] = await Promise.all([
      passwordFingerprint(passwordHash),
      coordination.read(sessionGenerationKey),
    ]);
    return { password, generation };
  }

  /**
   * Changes the live codes. Codes and requests past their time, or made under another password
   * or generation, are dropped on every write.
   */
  async function change(
    passwordHash: string,
    next: (live: StoredCode[]) => StoredCode[] | null,
  ): Promise<void> {
    const grant = await currentGrant(passwordHash);
    await updateRecord(coordination, pairingKey, (stored) => {
      const changed = next(liveCodes(stored, clock.now().getTime(), grant));
      return changed === null
        ? undefined
        : JSON.stringify({ version: recordVersion, codes: changed });
    });
  }

  async function read(passwordHash: string): Promise<StoredCode[]> {
    const [stored, grant] = await Promise.all([
      coordination.read(pairingKey),
      currentGrant(passwordHash),
    ]);
    return liveCodes(stored, clock.now().getTime(), grant);
  }

  return {
    async newCode(passwordHash) {
      const code = randomCode(codeLength);
      const entry: StoredCode = {
        codeHash: await sha256Hex(code),
        expiresAt: later(),
        ...(await currentGrant(passwordHash)),
      };
      await change(passwordHash, (live) => [...live, entry]);
      return { code, expiresAt: entry.expiresAt };
    },

    async request(typed, deviceName, passwordHash) {
      const codeHash = await sha256Hex(plainCode(typed));
      const pendingId = toHex(crypto.getRandomValues(new Uint8Array(32)));
      const request: WaitingRequest = {
        id: toHex(crypto.getRandomValues(new Uint8Array(16))),
        pendingHash: await sha256Hex(pendingId),
        deviceName,
        checkCode: randomCode(checkCodeLength),
        expiresAt: later(),
      };
      let accepted = false;
      await change(passwordHash, (live) => {
        const found = live.find((entry) => sameHash(entry.codeHash, codeHash));
        accepted = found !== undefined && found.request === undefined;
        if (found === undefined) return null;
        // A second request means someone else has the code too: the code and the first request end.
        const rest = live.filter((entry) => entry !== found);
        return accepted ? [...rest, { ...found, request }] : rest;
      });
      return accepted ? { pendingId, checkCode: request.checkCode } : null;
    },

    async waiting(passwordHash) {
      return (await read(passwordHash)).flatMap(({ request }) =>
        request === undefined || request.allowedBy !== undefined
          ? []
          : [
              {
                id: request.id,
                deviceName: request.deviceName,
                checkCode: request.checkCode,
                expiresAt: request.expiresAt,
              },
            ],
      );
    },

    async allow(requestId, allowedBy, passwordHash) {
      let allowed = false;
      await change(passwordHash, (live) => {
        const found = live.find(
          (entry) => entry.request?.id === requestId && entry.request.allowedBy === undefined,
        );
        allowed = found?.request !== undefined;
        if (found?.request === undefined) return null;
        const request = { ...found.request, allowedBy };
        return live.map((entry) => (entry === found ? { ...found, request } : entry));
      });
      return allowed;
    },

    async poll(pendingId, passwordHash) {
      const pendingHash = await sha256Hex(pendingId);
      let found: StoredCode | undefined;
      await change(passwordHash, (live) => {
        const entry = live.find(
          (code) => code.request !== undefined && sameHash(code.request.pendingHash, pendingHash),
        );
        found = entry;
        // Collected: the code and its request end before the token exists, so only one poll gets it.
        return entry?.request?.allowedBy === undefined
          ? null
          : live.filter((code) => code !== entry);
      });
      const request = found?.request;
      if (found === undefined || request === undefined) return { kind: "unknown" };
      if (request.allowedBy === undefined) return { kind: "waiting" };
      // The session starts in the code's generation, so a revoke since this poll read it still ends it.
      const device = {
        name: request.deviceName,
        allowedBy: request.allowedBy,
        generation: found.generation,
      };
      return { kind: "allowed", token: await devices.start(device, passwordHash) };
    },
  };
}

const recordVersion = 1;

/**
 * The codes in a stored record that haven't run out and were made under `grant`. Another version,
 * or text that doesn't read, holds none.
 */
function liveCodes(stored: string | null, now: number, grant: Grant): StoredCode[] {
  try {
    const record = JSON.parse(stored ?? "null") as { version?: unknown; codes?: unknown } | null;
    if (record?.version !== recordVersion || !Array.isArray(record.codes)) {
      return [];
    }
    return record.codes
      .filter(isStoredCode)
      .filter((entry) => now < Date.parse(entry.request?.expiresAt ?? entry.expiresAt))
      .filter(
        (entry) => entry.password === grant.password && entry.generation === grant.generation,
      );
  } catch {
    return [];
  }
}

function hasText(value: unknown, fields: readonly string[]): boolean {
  const record = (typeof value === "object" && value !== null ? value : {}) as Record<
    string,
    unknown
  >;
  return fields.every((field) => typeof record[field] === "string");
}

function isStoredCode(value: unknown): value is StoredCode {
  const request = (value as { request?: unknown } | null)?.request;
  const generation = (value as { generation?: unknown } | null)?.generation;
  return (
    hasText(value, ["codeHash", "expiresAt", "password"]) &&
    (generation === null || typeof generation === "string") &&
    (request === undefined || isWaitingRequest(request))
  );
}

/** A request's text fields, and `allowedBy` only as text, so a record can't allow on a number. */
function isWaitingRequest(value: unknown): value is WaitingRequest {
  const allowedBy = (value as { allowedBy?: unknown } | null)?.allowedBy;
  return (
    hasText(value, ["id", "pendingHash", "deviceName", "checkCode", "expiresAt"]) &&
    (allowedBy === undefined || typeof allowedBy === "string")
  );
}

function sameHash(first: string, second: string): boolean {
  return constantTimeEqual(encodeUtf8(first), encodeUtf8(second));
}

/** A code as typed, in capitals and without spaces or dashes, as it is shown in groups. */
function plainCode(typed: string): string {
  return typed.replace(/[\s-]/g, "").toUpperCase();
}

/**
 * `length` symbols of the pairing alphabet from the system's random source. A byte of 248 or
 * more is skipped, so each of the 31 symbols is equally likely.
 */
function randomCode(length: number): string {
  let code = "";
  while (code.length < length) {
    for (const byte of crypto.getRandomValues(new Uint8Array(length * 2))) {
      if (byte < 248 && code.length < length)
        code += pairingAlphabet.charAt(byte % pairingAlphabet.length);
    }
  }
  return code;
}
