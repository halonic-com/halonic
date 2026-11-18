import { maxAllowedOrigins, maxSecretValueLength, secretKey } from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";

/**
 * One stored secret: the name as it was last written, its value, and the
 * origins the value may be sent to. A secret saved before origins existed has
 * none, which is not the same as an empty list: the field is left out.
 */
export interface SecretEntry {
  readonly name: string;
  readonly value: string;
  readonly allowedOrigins?: readonly string[];
}

const formatVersion = 1;

/** Why an address can't be an allowed origin: it isn't an `http` or `https` address, or it holds a user name or password. */
export type AddressProblem = "not-an-address" | "has-user-info";

/**
 * The origin of an address, written as `new URL(…).origin` writes it, or the
 * reason it has none. The model resolver compares an address' origin with the
 * list as a whole string, so both sides must agree on this form.
 */
export function originOfAddress(address: string): { origin: string } | { problem: AddressProblem } {
  const url = URL.parse(address);
  if (url === null || (url.protocol !== "https:" && url.protocol !== "http:")) {
    return { problem: "not-an-address" };
  }
  if (url.username !== "" || url.password !== "") {
    return { problem: "has-user-info" };
  }
  return { origin: url.origin };
}

/**
 * The origin of an address, or `undefined` for an address that doesn't parse,
 * isn't `http` or `https`, or holds a user name or password.
 */
export function originOf(address: string): string | undefined {
  const found = originOfAddress(address);
  return "origin" in found ? found.origin : undefined;
}

/** The file's text: `{ "version": 1, "secrets": { "<KEY>": { "name", "value", "allowedOrigins"? } } }`, keyed by `secretKey`. */
export function secretsFileText(entries: ReadonlyMap<string, SecretEntry>): string {
  const secrets = Object.fromEntries(
    [...entries.keys()].sort().map((key) => [key, entries.get(key)]),
  );
  return `${JSON.stringify({ version: formatVersion, secrets }, null, 2)}\n`;
}

/**
 * The secrets in a file's text.
 *
 * Every complaint is about the file, never its content: a parse error of
 * `JSON.parse` quotes a piece of the text, which may be a value, so it is
 * dropped. Each entry is checked, so an edit by hand can't put a value under
 * a key that isn't its name's (which would give one secret two spellings).
 *
 * @throws KindedError `unavailable` when the file isn't what this version writes
 */
export function parseSecretsFile(text: string, file: string): Map<string, SecretEntry> {
  const data = parseJson(text);
  if (!isRecord(data) || !isRecord(data["secrets"])) {
    throw damaged(file);
  }
  if (data["version"] !== formatVersion) {
    throw new KindedError(
      "unavailable",
      `The secrets file ${file} is of a version this Halonic can't read.`,
      { fix: "Update Halonic, then run again." },
    );
  }
  const entries = new Map<string, SecretEntry>();
  for (const [key, entry] of Object.entries(data["secrets"])) {
    if (!isEntryFor(key, entry)) {
      throw damaged(file);
    }
    entries.set(key, {
      name: entry.name,
      value: entry.value,
      ...(entry.allowedOrigins === undefined ? {} : { allowedOrigins: [...entry.allowedOrigins] }),
    });
  }
  return entries;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEntryFor(key: string, entry: unknown): entry is SecretEntry {
  if (!isRecord(entry) || typeof entry["name"] !== "string" || typeof entry["value"] !== "string") {
    return false;
  }
  const { name, value } = entry as { name: string; value: string };
  return (
    value !== "" &&
    value.length <= maxSecretValueLength &&
    keyOf(name) === key &&
    hasValidOrigins(entry)
  );
}

/** Whether the entry's origins are left out, or a short list of origins exactly as `originOf` writes them. */
function hasValidOrigins(entry: Record<string, unknown>): boolean {
  const origins = entry["allowedOrigins"];
  if (origins === undefined) {
    return true;
  }
  return (
    Array.isArray(origins) &&
    origins.length >= 1 &&
    origins.length <= maxAllowedOrigins &&
    origins.every((origin) => typeof origin === "string" && originOf(origin) === origin)
  );
}

function keyOf(name: string): string | undefined {
  try {
    return secretKey(name);
  } catch {
    return undefined;
  }
}

function damaged(file: string): KindedError {
  return new KindedError("unavailable", `The secrets file ${file} is damaged.`, {
    fix: "Restore it from a backup, or remove it and set the secrets again.",
  });
}
