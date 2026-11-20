import { createHash } from "node:crypto";
import { type PhonePlatform, phonePlatforms } from "@halonicjs/ports";

/**
 * One paired phone as the host keeps it: public data only (build plan
 * decision 10). Its public key is no secret; the phone's private key never
 * leaves the phone.
 */
export interface PhoneRecord {
  /** The device id, from {@link deviceId}. */
  readonly id: string;
  /** Its static X25519 public key, 32 bytes, in base64url without padding. */
  readonly publicKey: string;
  /** Its name, with " (2)" and so on when another paired phone had it. */
  readonly name: string;
  readonly platform: PhonePlatform;
  /** When Allow was pressed, as an ISO 8601 time. */
  readonly pairedAt: string;
  /** When it was last seen, as an ISO 8601 time; absent until its first session. */
  readonly lastSeenAt?: string;
}

const fileVersion = 1;

/**
 * A phone's device id: the first 16 bytes of the SHA-256 of its static
 * public key, in base64url without padding, 22 characters (ADR "Pairing and
 * the end-to-end session", device id).
 */
export function deviceId(publicKey: Uint8Array): string {
  return createHash("sha256").update(publicKey).digest().subarray(0, 16).toString("base64url");
}

/** The file's text for these phones, oldest pairing first. */
export function writePhoneRecords(phones: readonly PhoneRecord[]): string {
  return `${JSON.stringify({ version: fileVersion, phones }, null, 2)}\n`;
}

/**
 * The phones in a file {@link writePhoneRecords} wrote; none when there is
 * no file. Throws an `Error` that says what is wrong with any other text,
 * so a damaged file is never read as "no phone paired" and written over.
 */
export function readPhoneRecords(text: string | undefined): PhoneRecord[] {
  if (text === undefined) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("The paired phones file isn't JSON.");
  }
  if (!isObject(parsed) || parsed["version"] !== fileVersion || !Array.isArray(parsed["phones"])) {
    throw new Error(`The paired phones file isn't version ${fileVersion} with a list of phones.`);
  }
  return parsed["phones"].map((phone: unknown, index) => readRecord(phone, index));
}

function readRecord(phone: unknown, index: number): PhoneRecord {
  const wrong = (what: string) =>
    new Error(`Phone ${index + 1} in the paired phones file ${what}.`);
  if (!isObject(phone)) throw wrong("isn't an object");
  const { id, publicKey, name, platform, pairedAt, lastSeenAt } = phone;
  const key = typeof publicKey === "string" ? Buffer.from(publicKey, "base64url") : undefined;
  // Node's decoder skips characters it doesn't know, so the key must also read back as written.
  if (key === undefined || key.length !== 32 || key.toString("base64url") !== publicKey) {
    throw wrong("has no 32-byte public key");
  }
  if (id !== deviceId(key)) {
    throw wrong("has an id that isn't its key's");
  }
  if (typeof name !== "string" || name === "") throw wrong("has no name");
  if (!phonePlatforms.includes(platform as PhonePlatform)) throw wrong("has no known platform");
  if (!isTime(pairedAt)) throw wrong("has no time it was paired");
  if (lastSeenAt !== undefined && !isTime(lastSeenAt)) {
    throw wrong("has a last seen that isn't a time");
  }
  return {
    id,
    publicKey,
    name,
    platform: platform as PhonePlatform,
    pairedAt,
    ...(lastSeenAt === undefined ? {} : { lastSeenAt }),
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTime(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}
