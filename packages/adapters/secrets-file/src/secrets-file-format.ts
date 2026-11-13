import { maxSecretValueLength, secretKey } from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";

/** One stored secret: the name as it was last written, and its value. */
export interface SecretEntry {
  readonly name: string;
  readonly value: string;
}

const formatVersion = 1;

/** The file's text: `{ "version": 1, "secrets": { "<KEY>": { "name", "value" } } }`, keyed by `secretKey`. */
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
    entries.set(key, { name: entry.name, value: entry.value });
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
  return value !== "" && value.length <= maxSecretValueLength && keyOf(name) === key;
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
