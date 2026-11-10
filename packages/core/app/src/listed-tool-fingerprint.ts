// The fingerprint of a listed tool and the address of the server it came
// from, as `ports.listed-tool-approval` asks. Pure, apart from the `Digest`
// port the hashes go through.

import type {
  ConnectorPin,
  Digest,
  ListedToolFingerprint,
  ListedToolText,
  ToolServer,
  WrittenDigest,
} from "@halonicjs/ports";
import {
  bytesToHex,
  canonicalJson,
  describeObject,
  encodeUtf8,
  err,
  isPlainObject,
  keyPath,
  ok,
  type Result,
} from "@halonicjs/std";
import { trustUrl } from "@halonicjs/workspace";
import { UntrustedText } from "./listed-tool-rules.ts";
import type { OfferedListedTool } from "./tool-listing.ts";

/** What every listed tool's fingerprint starts with. A change to what it covers moves it to `htl2:`. */
export const listedToolFingerprintPrefix = "htl1:";

/**
 * The listed tool as the model would see it, with every untrusted text
 * written as its plain text. This is what the fingerprint covers and what
 * the approval screen shows.
 *
 * Each text is read through `.text`, because an {@link UntrustedText}
 * refuses to be turned into JSON. Objects are copied with
 * `Object.fromEntries`, so a property named `__proto__` stays a property and
 * can't drop out of the fingerprint.
 *
 * @example
 * listedToolText(offered);
 * // => { name: "notes__lookup", description: "Finds a note by its title.", parameters: { … } }
 */
export function listedToolText(tool: OfferedListedTool): ListedToolText {
  return {
    name: tool.name,
    description: tool.description.text,
    parameters: withPlainTexts(tool.parameters) as Record<string, unknown>,
  };
}

function withPlainTexts(value: unknown): unknown {
  if (value instanceof UntrustedText) {
    return value.text;
  }
  if (Array.isArray(value)) {
    return value.map(withPlainTexts);
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, withPlainTexts(entry)]),
    );
  }
  return value;
}

/**
 * The listed tool's fingerprint: `htl1:` and the lowercase hex SHA-256 of
 * the UTF-8 bytes of the tool written as canonical JSON (RFC 8785).
 *
 * @returns the fingerprint, or why the tool can't have one, such as a
 *   string with an unpaired surrogate: the host refuses such a tool
 *
 * @example
 * const fingerprint = await listedToolFingerprint(listedToolText(offered), digest);
 * // => { ok: true, value: "htl1:9f86d081884c7d65…" }
 */
export async function listedToolFingerprint(
  tool: ListedToolText,
  digest: Digest,
): Promise<Result<ListedToolFingerprint, string>> {
  const json = strictCanonicalJson(tool);
  if (!json.ok) {
    return json;
  }
  const hash = bytesToHex(await digest.sha256(encodeUtf8(json.value)));
  const fingerprint: ListedToolFingerprint = `${listedToolFingerprintPrefix}${hash}`;
  return ok(fingerprint);
}

/**
 * Writes plain JSON data as canonical JSON, refusing anything else rather
 * than leaving it out: `undefined` anywhere, a number that isn't finite,
 * an array with holes, an object that isn't plain, a value that contains
 * itself, and a string with an unpaired surrogate. `canonicalJson` in
 * `@halonicjs/std` writes the text once the value has passed.
 *
 * @returns the canonical JSON text, or why the value isn't plain JSON
 *
 * @example
 * strictCanonicalJson({ b: 1, a: 1.0 }); // => { ok: true, value: '{"a":1,"b":1}' }
 * strictCanonicalJson({ a: Number.NaN }); // => { ok: false, error: "value.a is NaN, …" }
 */
export function strictCanonicalJson(value: unknown): Result<string, string> {
  const problem = plainJsonProblem(value, "value", new Set());
  return problem === null ? ok(canonicalJson(value)) : err(problem);
}

function plainJsonProblem(value: unknown, path: string, inside: Set<object>): string | null {
  if (value === null || typeof value === "boolean") {
    return null;
  }
  if (typeof value === "string") {
    return value.isWellFormed() ? null : `${path} holds an unpaired surrogate`;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? null : `${path} is ${value}, which isn't a finite number`;
  }
  if (typeof value !== "object") {
    return `${path} is ${value === undefined ? "undefined" : `a ${typeof value}`}`;
  }
  if (inside.has(value)) {
    return `${path} contains itself`;
  }
  inside.add(value);
  const problem = Array.isArray(value)
    ? arrayProblem(value, path, inside)
    : objectProblem(value, path, inside);
  inside.delete(value);
  return problem;
}

function arrayProblem(items: unknown[], path: string, inside: Set<object>): string | null {
  for (let index = 0; index < items.length; index += 1) {
    if (!(index in items)) {
      return `${path} has a hole at ${index}`;
    }
    const problem = plainJsonProblem(items[index], `${path}[${index}]`, inside);
    if (problem !== null) {
      return problem;
    }
  }
  return null;
}

function objectProblem(value: object, path: string, inside: Set<object>): string | null {
  if (!isPlainObject(value)) {
    return `${path} is ${describeObject(value)}, not a plain object`;
  }
  for (const [key, entry] of Object.entries(value)) {
    const problem = plainJsonProblem(entry, keyPath(path, key), inside);
    if (problem !== null) {
      return problem;
    }
  }
  return null;
}

/**
 * The `sha256:` digest of a connector's headers or environment, names and
 * values as the workspace writes them, `${NAME}` references unresolved.
 * Only this digest goes into the server's address, never the text, since a
 * person may have typed a token straight into a header.
 *
 * @returns the digest, or `null` when the workspace writes none
 *
 * @example
 * await writtenDigest({ Authorization: "Bearer ${NOTES_TOKEN}" }, digest); // => "sha256:…"
 * await writtenDigest({}, digest); // => null
 */
export async function writtenDigest(
  written: Readonly<Record<string, string>>,
  digest: Digest,
): Promise<WrittenDigest | null> {
  if (Object.keys(written).length === 0) {
    return null;
  }
  const hash = await digest.sha256(encodeUtf8(canonicalJson(written)));
  return `sha256:${bytesToHex(hash)}`;
}

/**
 * The address of an `http` connector: its URL written as the trust content
 * writes it (`trustUrl`: scheme and host in lowercase, no default port),
 * without its fragment, and its headers as a {@link writtenDigest}. The
 * query string stays, because it is part of the server's identity.
 *
 * A URL that `trustUrl` refuses, such as one with user info, can't be
 * trusted, so it has no address and its tools are never offered.
 *
 * @returns the address, or why the URL is refused
 *
 * @example
 * await httpToolServer("HTTPS://Notes.Example.com:443/mcp?team=a#top", {}, digest);
 * // => { ok: true, value: { kind: "http", url: "https://notes.example.com/mcp?team=a", headers: null } }
 */
export async function httpToolServer(
  url: string,
  headers: Readonly<Record<string, string>>,
  digest: Digest,
): Promise<Result<ToolServer, string>> {
  const written = trustUrl(url);
  if ("refused" in written) {
    return err(written.refused);
  }
  // `trustUrl` keeps the fragment; the server never sees it.
  const withoutFragment = written.url.split("#", 1)[0] ?? written.url;
  return ok({ kind: "http", url: withoutFragment, headers: await writtenDigest(headers, digest) });
}

/**
 * The address of a `stdio` connector: its command and arguments as written,
 * its pin or `null`, and its environment as a {@link writtenDigest}.
 *
 * @example
 * await stdioToolServer(
 *   { command: "notes-mcp", args: ["--token=${NOTES_TOKEN}"], env: {} },
 *   digest,
 * );
 * // => { kind: "stdio", command: "notes-mcp", args: ["--token=${NOTES_TOKEN}"], pin: null, env: null }
 */
export async function stdioToolServer(
  connector: {
    readonly command: string;
    readonly args: readonly string[];
    readonly env: Readonly<Record<string, string>>;
    readonly pin?: ConnectorPin;
  },
  digest: Digest,
): Promise<ToolServer> {
  return {
    kind: "stdio",
    command: connector.command,
    args: [...connector.args],
    pin: connector.pin === undefined ? null : { ...connector.pin },
    env: await writtenDigest(connector.env, digest),
  };
}

/**
 * Whether two addresses name the same server. They are compared as
 * canonical JSON, so an integration's settings written in another key order
 * are the same address.
 *
 * @example
 * sameToolServer(
 *   { kind: "integration", id: "notes", version: "1.2.0", settings: { a: 1, b: 2 } },
 *   { kind: "integration", id: "notes", version: "1.2.0", settings: { b: 2, a: 1 } },
 * ); // => true
 */
export function sameToolServer(left: ToolServer, right: ToolServer): boolean {
  const leftJson = strictCanonicalJson(left);
  const rightJson = strictCanonicalJson(right);
  // An address that isn't plain JSON matches nothing, so its tools wait.
  return leftJson.ok && rightJson.ok && leftJson.value === rightJson.value;
}
