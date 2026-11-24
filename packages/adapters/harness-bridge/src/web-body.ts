// A request body's limits, and reading a Web body within them. Web-standard
// APIs only, so the Worker reads bodies as the Node bridge does.

import { KindedError } from "@halonicjs/std";

/** How much of a request the bridge accepts, and how long it waits for it. */
export interface BodyLimits {
  /** The largest body the bridge reads, in bytes. */
  maxBytes: number;
  /** How long the whole body may take to arrive, in milliseconds. */
  timeoutMs: number;
}

/** The error for a body over {@link BodyLimits.maxBytes}. */
export function bodyTooLarge(limits: BodyLimits): KindedError {
  return new KindedError(
    "invalid_input",
    `The request is larger than the Halonic bridge accepts (${limits.maxBytes} bytes).`,
  );
}

/** The error for a body that took longer than {@link BodyLimits.timeoutMs}. */
export function bodyTooSlow(limits: BodyLimits): KindedError {
  const seconds = limits.timeoutMs / 1000;
  return new KindedError("invalid_input", `The request didn't arrive within ${seconds} seconds.`);
}

/**
 * Reads a Web request's body within the limits (failure-path rule 1: every
 * wait ends). It stops at the first byte over the limit and lets the rest go.
 *
 * @throws KindedError `invalid_input` when the body is too large or doesn't arrive in time
 */
export async function readWebBody(
  body: ReadableStream<Uint8Array> | null,
  limits: BodyLimits,
): Promise<Uint8Array> {
  if (body === null) return new Uint8Array();
  const reader = body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeUp = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(bodyTooSlow(limits)), limits.timeoutMs);
  });
  try {
    return await Promise.race([readAll(reader, limits), timeUp]);
  } catch (error) {
    // Let whatever is still on its way go; the error is the one that counts.
    await reader.cancel(error).catch(() => undefined);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function readAll(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  limits: BodyLimits,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limits.maxBytes) throw bodyTooLarge(limits);
    chunks.push(value);
  }
  const whole = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    whole.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return whole;
}
