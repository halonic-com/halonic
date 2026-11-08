import type { SecretPlacement } from "@halonicjs/ports";

/** What a secret value is replaced with wherever the filter finds it. */
export const secretRemoved = "[secret removed]";

/** A secret value, and where the kit placed it, if it did. */
export interface SecretOnWire {
  readonly value: string;
  /** How the kit put it in a request, so the placed forms are matched whole. */
  readonly placements?: readonly SecretPlacement[];
}

/**
 * Every form of a set of secrets the filter looks for, longest first. Build
 * it once with {@link secretForms} and pass it to {@link removeSecrets} or
 * {@link SecretRemover}. Only {@link secretForms} makes one: `texts`, `bytes`
 * and `longest` must agree, or the filter misses a form.
 */
export interface SecretForms {
  readonly texts: readonly string[];
  /** The same forms as UTF-8 bytes, for bodies. */
  readonly bytes: readonly Uint8Array[];
  /** The length in bytes of the longest form, or 0 when there are none. */
  readonly longest: number;
}

const utf8 = new TextEncoder();
const removedBytes = utf8.encode(secretRemoved);

/**
 * The forms of each secret the filter matches: the raw value; the exact
 * text the kit put on the wire (`Bearer <value>`, the header prefix plus the
 * value, `field=<form-encoded value>`); and the URL-encoded, form-encoded
 * and JSON-escaped copies of each. Base64, reversed, split or otherwise
 * transformed copies are not matched: a host allowed to receive a key can
 * always send it back in some other form.
 *
 * @example
 * const forms = secretForms([{ value: key, placements: [{ secret: "example-key", as: "bearer" }] }]);
 * removeSecrets(`{"auth":"Bearer ${key}"}`, forms); // '{"auth":"[secret removed]"}'
 */
export function secretForms(secrets: Iterable<SecretOnWire>): SecretForms {
  const texts = new Set<string>();
  for (const { value, placements = [] } of secrets) {
    if (value === "") continue;
    for (const onWire of [value, ...placements.map((placement) => placed(placement, value))]) {
      for (const copy of encodedCopies(onWire)) texts.add(copy);
    }
  }
  const sorted = [...texts].sort((a, b) => utf8.encode(b).length - utf8.encode(a).length);
  const bytes = sorted.map((text) => utf8.encode(text));
  return { texts: sorted, bytes, longest: bytes[0]?.length ?? 0 };
}

/** The exact text the kit puts on the wire for one placement. */
function placed(placement: SecretPlacement, value: string): string {
  switch (placement.as) {
    case "bearer":
      return `Bearer ${value}`;
    case "header":
      return `${placement.prefix ?? ""}${value}`;
    case "form":
      return new URLSearchParams([[placement.field, value]]).toString();
  }
}

/** The text as it is, and as URL-encoding, form-encoding and JSON escaping commonly write it. */
function encodedCopies(text: string): string[] {
  const urlEncoded = encodeURIComponent(text);
  const json = JSON.stringify(text).slice(1, -1);
  return [
    text,
    urlEncoded,
    urlEncoded.replace(/%[0-9A-F]{2}/g, (hex) => hex.toLowerCase()),
    new URLSearchParams([["", text]]).toString().slice(1),
    json,
    json.replaceAll("/", "\\/"),
  ];
}

/**
 * The text with every form of the secrets replaced by `[secret removed]`.
 * For headers, URLs, tool results, error messages and log lines.
 *
 * @example
 * removeSecrets(String(error), forms)
 */
export function removeSecrets(text: string, forms: SecretForms): string {
  let filtered = text;
  for (const form of forms.texts) filtered = filtered.replaceAll(form, secretRemoved);
  return filtered;
}

/**
 * The error with every form of the secrets removed from its message, its
 * stack and its causes. A kit error can repeat a URL a server chose, such as
 * a redirect target, so every error leaving a request goes through here.
 * The error is changed in place, so its class and `code` stay; one that
 * can't be changed is replaced by a plain `Error` with the filtered message.
 */
export function removeSecretsFromError(error: unknown, forms: SecretForms): unknown {
  return withoutSecrets(error, forms, new Set());
}

function withoutSecrets(error: unknown, forms: SecretForms, seen: Set<unknown>): unknown {
  if (forms.longest === 0) return error;
  if (typeof error === "string") return removeSecrets(error, forms);
  if (!(error instanceof Error) || seen.has(error)) return error;
  seen.add(error);
  const message = removeSecrets(error.message, forms);
  const stack = error.stack;
  const cause = withoutSecrets(error.cause, forms, seen);
  try {
    if (message !== error.message) error.message = message;
    if (stack !== undefined) error.stack = removeSecrets(stack, forms);
    if (cause !== error.cause) error.cause = cause;
    return error;
  } catch {
    return new Error(message);
  }
}

/**
 * Removes the secrets from a body that arrives in pieces, without holding
 * the whole body. It holds back the last `longest form − 1` bytes of each
 * piece, so a value split across two pieces is still found.
 *
 * @example
 * const remover = new SecretRemover(forms);
 * for (const piece of pieces) send(remover.push(piece));
 * send(remover.flush());
 */
export class SecretRemover {
  readonly #forms: SecretForms;
  /** The forms by their first byte, longest first, to skip most bytes quickly. */
  readonly #byFirstByte = new Map<number, Uint8Array[]>();
  #held: Uint8Array = new Uint8Array(0);
  #removed = 0;

  constructor(forms: SecretForms) {
    this.#forms = forms;
    for (const form of forms.bytes) {
      const first = form[0] as number;
      this.#byFirstByte.set(first, [...(this.#byFirstByte.get(first) ?? []), form]);
    }
  }

  /** How many secrets it has replaced so far. */
  get removed(): number {
    return this.#removed;
  }

  /** The filtered bytes that are safe to pass on; may be empty while bytes are held back. */
  push(piece: Uint8Array): Uint8Array {
    if (this.#forms.longest === 0) return piece;
    const data = concat([this.#held, piece]);
    const { output, rest } = this.#scan(data, data.length - (this.#forms.longest - 1));
    this.#held = rest;
    return output;
  }

  /** The filtered bytes still held back, at the end of the body. */
  flush(): Uint8Array {
    const { output } = this.#scan(this.#held, this.#held.length);
    this.#held = new Uint8Array(0);
    return output;
  }

  /**
   * Replaces matches that start before `end`. Every form fits in `data`
   * from any such start, so a match is never cut off. Returns what follows
   * the last byte looked at, to be scanned with the next piece.
   */
  #scan(data: Uint8Array, end: number): { output: Uint8Array; rest: Uint8Array } {
    const pieces: Uint8Array[] = [];
    let kept = 0;
    let at = 0;
    while (at < end) {
      const match = this.#matchAt(data, at);
      if (match === 0) {
        at++;
        continue;
      }
      pieces.push(data.subarray(kept, at), removedBytes);
      this.#removed++;
      at += match;
      kept = at;
    }
    pieces.push(data.subarray(kept, at));
    return { output: concat(pieces), rest: data.slice(at) };
  }

  /** The length of the longest form that starts at `at`, or 0. */
  #matchAt(data: Uint8Array, at: number): number {
    for (const form of this.#byFirstByte.get(data[at] as number) ?? []) {
      if (at + form.length <= data.length && form.every((byte, i) => data[at + i] === byte)) {
        return form.length;
      }
    }
    return 0;
  }
}

/**
 * A stream step that removes the secrets, for the bridge's stderr and log.
 *
 * @example
 * runner.stderr.pipeThrough(removeSecretsStream(forms))
 */
export function removeSecretsStream(forms: SecretForms): TransformStream<Uint8Array, Uint8Array> {
  const remover = new SecretRemover(forms);
  return new TransformStream({
    transform: (piece, controller) => enqueueIfAny(controller, remover.push(piece)),
    flush: (controller) => enqueueIfAny(controller, remover.flush()),
  });
}

function enqueueIfAny(
  controller: TransformStreamDefaultController<Uint8Array>,
  bytes: Uint8Array,
): void {
  if (bytes.length > 0) controller.enqueue(bytes);
}

/**
 * The headers with the secrets removed from every value. A header whose
 * name holds a secret is left out, because a name can't hold the marker.
 */
export function removeSecretsFromHeaders(headers: Headers, forms: SecretForms): Headers {
  const filtered = new Headers();
  for (const [name, value] of headers) {
    if (removeSecrets(name, forms) !== name) continue;
    filtered.append(name, removeSecrets(value, forms));
  }
  return filtered;
}

function concat(pieces: readonly Uint8Array[]): Uint8Array {
  if (pieces.length === 1) return pieces[0] as Uint8Array;
  const joined = new Uint8Array(pieces.reduce((sum, piece) => sum + piece.length, 0));
  let offset = 0;
  for (const piece of pieces) {
    joined.set(piece, offset);
    offset += piece.length;
  }
  return joined;
}
