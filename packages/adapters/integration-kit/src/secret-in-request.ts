import type { Secrets } from "@halonicjs/ports";
import type { IntegrationPolicy } from "./policy.ts";
import { IntegrationRefusedError } from "./refused.ts";
import type { Body } from "./request-body.ts";
import {
  removeSecrets,
  type SecretForms,
  SecretRemover,
  secretForms,
  secretRemoved,
} from "./secret-filter.ts";

/**
 * The values of every secret the integration declares and the workspace
 * has set up, whether this request places them or not. The kit refuses a
 * request that carries one of them anywhere it didn't put it.
 */
export async function readDeclaredSecrets(
  policy: IntegrationPolicy,
  secrets: Secrets,
): Promise<Map<string, string>> {
  const values = new Map<string, string>();
  for (const name of Object.keys(policy.secrets)) {
    const value = await secrets.get(name);
    if (value !== null && value !== "") values.set(name, value);
  }
  return values;
}

/** The parts of a request the integration wrote, before the kit places any secret. */
export interface OwnParts {
  /** The method as the integration gave it. */
  readonly method?: string | undefined;
  /**
   * The method the kit sends, uppercased. Matching is case-sensitive, so a
   * key in capitals given as a lower-case method only shows up here.
   */
  readonly sentMethod?: string;
  /** As the integration or a redirect's `Location` wrote it, resolved against `base`. */
  readonly url: string;
  readonly base?: URL;
  readonly headers?: Headers;
  readonly body?: Body;
}

/**
 * Refuses the request as `secret-in-request` when the integration's own
 * method, as given or as sent, URL, headers or body hold a secret value in any form the filter
 * knows. Runs before placement, so a secret the kit puts in is never counted.
 * Runs on every redirect hop too, because a server can put a value it was
 * sent into the next `Location`.
 */
export function refuseCarriedSecrets(
  policy: IntegrationPolicy,
  forms: SecretForms,
  parts: OwnParts,
): void {
  if (forms.longest === 0) return;
  const headerLines = [...(parts.headers ?? [])].map(([name, value]) => `${name}: ${value}`);
  const url = [parts.url, withEscapesDecoded(parts.url), parsed(parts.url, parts.base)];
  const texts = [parts.method ?? "", parts.sentMethod ?? "", ...url, ...headerLines];
  if (texts.some((text) => holds(text, forms)) || bodyHolds(parts.body ?? null, forms)) {
    throw new SecretInRequestError(policy, {
      method: shown((parts.method ?? "GET").toUpperCase(), forms),
      host: shown(hostOf(parts.url, parts.base), forms),
    });
  }
}

/** The forms of the secret values, matched raw and in every encoding the filter knows. */
export function carriedForms(values: Iterable<string>): SecretForms {
  return secretForms([...values].map((value) => ({ value })));
}

/**
 * A request that carries a secret value the kit didn't place. It names only
 * the host, with any secret removed, never the path: the parsed path can
 * hold the value in an encoding the filter doesn't match.
 */
export class SecretInRequestError extends IntegrationRefusedError {
  /** For the request log: the method and host, each with any secret removed, and no path. */
  readonly logged: { readonly method: string; readonly host: string; readonly path: string };

  constructor(policy: IntegrationPolicy, shown: { method: string; host: string }) {
    super(
      "secret-in-request",
      `${policy.name}: a request to ${shown.host} carries the value of a secret the kit didn't put there, so nothing was sent`,
    );
    this.logged = { method: shown.method, host: shown.host, path: "" };
  }
}

function holds(text: string, forms: SecretForms): boolean {
  return removeSecrets(text, forms) !== text;
}

function bodyHolds(body: Body, forms: SecretForms): boolean {
  if (typeof body === "string") return holds(body, forms) || holds(withEscapesDecoded(body), forms);
  if (body instanceof URLSearchParams) return holds(body.toString(), forms);
  let bytes: Uint8Array;
  if (body instanceof ArrayBuffer) bytes = new Uint8Array(body);
  else if (ArrayBuffer.isView(body)) {
    bytes = new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  } else return false; // none, or a body `checkBody` has already refused
  const remover = new SecretRemover(forms);
  remover.push(bytes);
  remover.flush();
  return remover.removed > 0;
}

const escapeRun = /(?:%[0-9A-Fa-f]{2})+/g;
const oneEscape = /%[0-9A-Fa-f]{2}/g;

/**
 * The text with its percent-escapes undone, so a value encoded only in part
 * is still found. `decodeURIComponent` throws on the whole text for one bad
 * escape, so each run of escapes is decoded on its own: a malformed `%ZZ`
 * stays as it is. A run that isn't valid UTF-8, such as `%2D%FF`, is decoded
 * one escape at a time, so its `%2D` still becomes `-`.
 */
function withEscapesDecoded(text: string): string {
  return text.replace(
    escapeRun,
    (run) =>
      decodedOrNull(run) ?? run.replace(oneEscape, (single) => decodedOrNull(single) ?? single),
  );
}

function decodedOrNull(escapes: string): string | null {
  try {
    return decodeURIComponent(escapes);
  } catch {
    return null;
  }
}

/** The URL as `fetch` will send it: parsing lowercases the host and encodes the path. */
function parsed(url: string, base: URL | undefined): string {
  try {
    return new URL(url, base).href;
  } catch {
    return url;
  }
}

function hostOf(url: string, base: URL | undefined): string {
  try {
    return new URL(url, base).host;
  } catch {
    return "an invalid URL";
  }
}

/**
 * The text, or `[secret removed]` when it holds a secret. URL parsing
 * lowercases a host and the log uppercases a method, so this ignores case.
 */
function shown(text: string, forms: SecretForms): string {
  const lower = text.toLowerCase();
  return forms.texts.some((form) => lower.includes(form.toLowerCase())) ? secretRemoved : text;
}
