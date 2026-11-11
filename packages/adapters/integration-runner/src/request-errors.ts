// How a failed request crosses the bridge: Halonic turns the kit's error into
// an `error` frame, and the runner turns the frame back into the error the
// integration would have got in-process.

import {
  IntegrationRefusedError,
  IntegrationTimeoutError,
  type RefusalCode,
} from "@halonicjs/adapter-integration-kit/integration";

/**
 * The bridge's own reasons for an `error` frame, next to the kit's
 * {@link RefusalCode}s.
 *
 * - `timeout`: the kit's time limit ran out.
 * - `failed`: the network or the server failed.
 * - `call-not-running`: the request came from outside a running tool call, or
 *   its call ended while it was open (A37).
 * - `too-many-requests`: the integration already has the most requests in flight (A21).
 */
export const bridgeErrorCodes = [
  "timeout",
  "failed",
  "call-not-running",
  "too-many-requests",
] as const;

/** One of {@link bridgeErrorCodes}. */
export type BridgeErrorCode = (typeof bridgeErrorCodes)[number];

/** What an `error` frame carries. */
export interface RequestFailure {
  code: RefusalCode | BridgeErrorCode;
  message: string;
}

/**
 * The failure to send for an error from the kit's client. The kit's
 * messages are safe to show; any other error is reduced to `failed` with a
 * fixed message, because it can hold anything.
 */
export function requestFailure(error: unknown): RequestFailure {
  if (error instanceof IntegrationRefusedError) return { code: error.code, message: error.message };
  if (error instanceof IntegrationTimeoutError) return { code: "timeout", message: error.message };
  return { code: "failed", message: "the request failed" };
}

/**
 * The error the integration gets for a failure, the same class as in-process.
 * Halonic writes the code, so a code the runner doesn't know is one of the
 * kit's refusals added later.
 */
export function errorFromFailure(failure: { code: string; message: string }): Error {
  switch (failure.code) {
    case "timeout":
      return new IntegrationTimeoutError(failure.message);
    case "failed":
      // In-process, a network failure from `fetch` is a TypeError too.
      return new TypeError(failure.message);
    case "call-not-running":
    case "too-many-requests":
      return new Error(failure.message);
    default:
      return new IntegrationRefusedError(failure.code as RefusalCode, failure.message);
  }
}
