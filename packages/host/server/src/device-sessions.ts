import type { Clock, Coordination } from "@halonicjs/ports";
import { constantTimeEqual, encodeUtf8 } from "@halonicjs/std";
import { passwordFingerprint, sessionGenerationKey, sha256Hex, toHex } from "./stored-session.ts";
import { updateRecord } from "./versioned-record.ts";

/**
 * Device sessions (requirement `server.device-pairing`): one entry per paired device, all in one
 * `Coordination` value, because the port can't list keys and `halonic serve devices` lists them.
 */
export const deviceSessionsKey = "devices:sessions";

const dayMs = 24 * 60 * 60 * 1000;
/** A device session ends this long after its last use. */
export const deviceIdleLimitMs = 30 * dayMs;
/** A device session ends this long after it started, however often it is used. */
export const deviceAgeLimitMs = 90 * dayMs;
/** Last seen is written at most this often, so a busy device doesn't write on every request. */
const lastSeenStepMs = 60 * 60 * 1000;

/**
 * Who allowed a device: `console` for `halonic serve pair`, `browser` for a password session, or
 * the id of the paired device whose session allowed it.
 */
export type AllowedBy = string;

/** One paired device as the store keeps it. `tokenHash` is the SHA-256 of its token, never the token. */
interface StoredDevice {
  readonly id: string;
  readonly name: string;
  readonly tokenHash: string;
  readonly allowedBy: AllowedBy;
  readonly startedAt: string;
  readonly lastSeenAt: string;
  /** The fingerprint of the password hash it was allowed under, so a new password ends it. */
  readonly password: string;
  /** The session generation it started in, so revoking every session ends it too. */
  readonly generation: string | null;
}

/** A paired device as a list shows it. */
export interface DeviceView {
  readonly id: string;
  readonly name: string;
  readonly allowedBy: AllowedBy;
  readonly startedAt: string;
  readonly lastSeenAt: string;
}

/** What revoking a device found: whether it was there, and the live devices it allowed. */
export interface RevokeResult {
  readonly revoked: boolean;
  readonly allowedDevices: readonly DeviceView[];
}

/** The device sessions of one server. Every call takes the current `serve-password` hash. */
export interface DeviceSessions {
  /** Starts a session for a newly allowed device and gives its token, the only time it is given. */
  start(
    device: { readonly name: string; readonly allowedBy: AllowedBy },
    passwordHash: string,
  ): Promise<string>;
  /** The id of the live device that holds `token`, or `null`. Notes the use as last seen. */
  check(token: string, passwordHash: string): Promise<string | null>;
  /** The live devices. */
  list(passwordHash: string): Promise<readonly DeviceView[]>;
  /** Ends one device's session only, and names the live devices it allowed, so a client can offer to revoke them. */
  revoke(deviceId: string, passwordHash: string): Promise<RevokeResult>;
}

type DevicePorts = { readonly coordination: Coordination; readonly clock: Clock };

/** The device sessions, kept in `ports.coordination`. */
export function createDeviceSessions({ coordination, clock }: DevicePorts): DeviceSessions {
  /** Whether a device still counts: young enough, used lately, under this password and generation. */
  function isLive(device: StoredDevice, fingerprint: string, generation: string | null): boolean {
    const now = clock.now().getTime();
    return (
      now < Date.parse(device.startedAt) + deviceAgeLimitMs &&
      now < Date.parse(device.lastSeenAt) + deviceIdleLimitMs &&
      device.password === fingerprint &&
      device.generation === generation
    );
  }

  /** The live devices, read with the current generation. */
  async function liveDevices(passwordHash: string): Promise<StoredDevice[]> {
    const [stored, generation, fingerprint] = await Promise.all([
      coordination.read(deviceSessionsKey),
      coordination.read(sessionGenerationKey),
      passwordFingerprint(passwordHash),
    ]);
    return readDevices(stored).filter((device) => isLive(device, fingerprint, generation));
  }

  /** Changes the list by compare-and-set; ended devices are dropped on every write. */
  async function change(
    passwordHash: string,
    next: (live: StoredDevice[]) => StoredDevice[] | null,
  ): Promise<void> {
    const [generation, fingerprint] = await Promise.all([
      coordination.read(sessionGenerationKey),
      passwordFingerprint(passwordHash),
    ]);
    await updateRecord(coordination, deviceSessionsKey, (stored) => {
      const live = readDevices(stored).filter((device) => isLive(device, fingerprint, generation));
      const changed = next(live);
      return changed === null
        ? undefined
        : JSON.stringify({ version: recordVersion, devices: changed });
    });
  }

  return {
    async start(device, passwordHash) {
      const token = toHex(crypto.getRandomValues(new Uint8Array(32)));
      const now = clock.now().toISOString();
      const entry: StoredDevice = {
        id: `device_${toHex(crypto.getRandomValues(new Uint8Array(12)))}`,
        name: device.name,
        tokenHash: await sha256Hex(token),
        allowedBy: device.allowedBy,
        startedAt: now,
        lastSeenAt: now,
        password: await passwordFingerprint(passwordHash),
        generation: await coordination.read(sessionGenerationKey),
      };
      await change(passwordHash, (live) => [...live, entry]);
      return token;
    },

    async check(token, passwordHash) {
      const tokenHash = encodeUtf8(await sha256Hex(token));
      // Every entry is compared, so the time taken doesn't tell which one matched.
      let found: StoredDevice | undefined;
      for (const device of await liveDevices(passwordHash)) {
        if (constantTimeEqual(encodeUtf8(device.tokenHash), tokenHash)) found = device;
      }
      if (found === undefined) {
        return null;
      }
      const now = clock.now();
      if (now.getTime() - Date.parse(found.lastSeenAt) >= lastSeenStepMs) {
        const seen = { ...found, lastSeenAt: now.toISOString() };
        await change(passwordHash, (live) =>
          live.map((device) => (device.id === seen.id ? seen : device)),
        );
      }
      return found.id;
    },

    async list(passwordHash) {
      return (await liveDevices(passwordHash)).map(viewOf);
    },

    async revoke(deviceId, passwordHash) {
      let result: RevokeResult = { revoked: false, allowedDevices: [] };
      await change(passwordHash, (live) => {
        const left = live.filter((device) => device.id !== deviceId);
        result = {
          revoked: left.length < live.length,
          allowedDevices: left.filter((device) => device.allowedBy === deviceId).map(viewOf),
        };
        return result.revoked ? left : null;
      });
      return result;
    },
  };
}

const recordVersion = 1;

function viewOf({ id, name, allowedBy, startedAt, lastSeenAt }: StoredDevice): DeviceView {
  return { id, name, allowedBy, startedAt, lastSeenAt };
}

/**
 * The devices in a stored record. A record of another version, such as one a newer build wrote
 * before a rollback, or one that doesn't read, holds no devices: every device counts as signed
 * out, and the server keeps running.
 */
function readDevices(stored: string | null): StoredDevice[] {
  if (stored === null) {
    return [];
  }
  try {
    const record = JSON.parse(stored) as { version?: unknown; devices?: unknown };
    if (record?.version !== recordVersion || !Array.isArray(record.devices)) {
      return [];
    }
    return record.devices.filter(isStoredDevice);
  } catch {
    return [];
  }
}

const textFields = ["id", "name", "tokenHash", "allowedBy", "startedAt", "lastSeenAt", "password"];

function isStoredDevice(value: unknown): value is StoredDevice {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const fields = value as Record<string, unknown>;
  const generation = fields["generation"];
  return (
    textFields.every((field) => typeof fields[field] === "string") &&
    (generation === null || typeof generation === "string")
  );
}
