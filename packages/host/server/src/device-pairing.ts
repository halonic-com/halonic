import type { Clock, Coordination } from "@halonicjs/ports";
import { pairingAlphabet } from "@halonicjs/ports";
import { constantTimeEqual, encodeUtf8 } from "@halonicjs/std";
import type { AllowedBy, DeviceSessions } from "./device-sessions.ts";
import { sha256Hex, toHex } from "./stored-session.ts";
import { updateRecord } from "./versioned-record.ts";

/**
 * Pairing a device (requirement `server.device-pairing`): the owner makes a one-time code, the
 * device sends it and gets a pending ID and a check code, the owner allows the request that shows
 * the same check code, and the device collects its token once with the pending ID. Every waiting
 * code is kept in one `Coordination` value, so the owner can list the requests.
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
  readonly request?: WaitingRequest;
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

/** The pairing steps of one server. */
export interface DevicePairing {
  /** A new one-time code, for the owner to give to the device. */
  newCode(): Promise<{ readonly code: string; readonly expiresAt: string }>;
  /**
   * A device's request with a code: its pending ID and check code, or `null` when the code isn't
   * a live, unused one. A second request with a code that has one waiting cancels both.
   */
  request(
    code: string,
    deviceName: string,
  ): Promise<{ pendingId: string; checkCode: string } | null>;
  /** The requests waiting for Allow. */
  waiting(): Promise<readonly PairingRequestView[]>;
  /** Allows the waiting request with this id; `false` when there is none. */
  allow(requestId: string, allowedBy: AllowedBy): Promise<boolean>;
  /** Polls a pending ID; once allowed, starts the device's session and gives its token once. */
  poll(pendingId: string, passwordHash: string): Promise<PairingPoll>;
}

type PairingPorts = { readonly coordination: Coordination; readonly clock: Clock };

/** The pairing steps, kept in `ports.coordination`, that start sessions in `devices`. */
export function createDevicePairing(ports: PairingPorts, devices: DeviceSessions): DevicePairing {
  const { coordination, clock } = ports;
  const later = () => new Date(clock.now().getTime() + pairingLifetimeMs).toISOString();

  /** Changes the live codes; codes and requests past their time are dropped on every write. */
  async function change(next: (live: StoredCode[]) => StoredCode[] | null): Promise<void> {
    await updateRecord(coordination, pairingKey, (stored) => {
      const changed = next(liveCodes(stored, clock.now().getTime()));
      return changed === null
        ? undefined
        : JSON.stringify({ version: recordVersion, codes: changed });
    });
  }

  async function read(): Promise<StoredCode[]> {
    return liveCodes(await coordination.read(pairingKey), clock.now().getTime());
  }

  return {
    async newCode() {
      const code = randomCode(codeLength);
      const entry: StoredCode = { codeHash: await sha256Hex(code), expiresAt: later() };
      await change((live) => [...live, entry]);
      return { code, expiresAt: entry.expiresAt };
    },

    async request(typed, deviceName) {
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
      await change((live) => {
        const found = live.find((entry) => sameHash(entry.codeHash, codeHash));
        accepted = found !== undefined && found.request === undefined;
        if (found === undefined) return null;
        // A second request means someone else has the code too: the code and the first request end.
        const rest = live.filter((entry) => entry !== found);
        return accepted ? [...rest, { ...found, request }] : rest;
      });
      return accepted ? { pendingId, checkCode: request.checkCode } : null;
    },

    async waiting() {
      return (await read()).flatMap(({ request }) =>
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

    async allow(requestId, allowedBy) {
      let allowed = false;
      await change((live) => {
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
      let found: WaitingRequest | undefined;
      await change((live) => {
        const entry = live.find(
          (code) => code.request !== undefined && sameHash(code.request.pendingHash, pendingHash),
        );
        found = entry?.request;
        // Collected: the code and its request end before the token exists, so only one poll gets it.
        return entry?.request?.allowedBy === undefined
          ? null
          : live.filter((code) => code !== entry);
      });
      if (found === undefined) return { kind: "unknown" };
      if (found.allowedBy === undefined) return { kind: "waiting" };
      const device = { name: found.deviceName, allowedBy: found.allowedBy };
      return { kind: "allowed", token: await devices.start(device, passwordHash) };
    },
  };
}

const recordVersion = 1;

/** The codes in a stored record that haven't run out. Another version, or text that doesn't read, holds none. */
function liveCodes(stored: string | null, now: number): StoredCode[] {
  try {
    const record = JSON.parse(stored ?? "null") as { version?: unknown; codes?: unknown } | null;
    if (record?.version !== recordVersion || !Array.isArray(record.codes)) {
      return [];
    }
    return record.codes
      .filter(isStoredCode)
      .filter((entry) => now < Date.parse(entry.request?.expiresAt ?? entry.expiresAt));
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
  const requestFields = ["id", "pendingHash", "deviceName", "checkCode", "expiresAt"];
  return (
    hasText(value, ["codeHash", "expiresAt"]) &&
    (request === undefined || hasText(request, requestFields))
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
