import type { Readable } from "node:stream";
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

/**
 * Reads a request's body, within the limits (failure-path rule 1: every wait
 * ends). It stops at the first byte over the limit, without reading the rest
 * into memory.
 *
 * @throws KindedError `invalid_input` when the body is too large or doesn't arrive in time
 */
export function readRequestBody(request: Readable, limits: BodyLimits): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    const stop = (error: Error) => {
      cleanUp();
      // Throw away whatever is still on its way, so the socket can carry the error reply.
      request.resume();
      reject(error);
    };
    const onData = (chunk: Buffer) => {
      size += chunk.length;
      if (size > limits.maxBytes) {
        stop(bodyTooLarge(limits));
        return;
      }
      chunks.push(chunk);
    };
    const onEnd = () => {
      cleanUp();
      resolve(Buffer.concat(chunks));
    };
    const onError = (error: Error) => stop(error);
    const timer = setTimeout(() => {
      const seconds = limits.timeoutMs / 1000;
      stop(
        new KindedError("invalid_input", `The request didn't arrive within ${seconds} seconds.`),
      );
    }, limits.timeoutMs);

    function cleanUp() {
      clearTimeout(timer);
      request.off("data", onData);
      request.off("end", onEnd);
      request.off("error", onError);
    }

    request.on("data", onData);
    request.on("end", onEnd);
    request.on("error", onError);
  });
}
