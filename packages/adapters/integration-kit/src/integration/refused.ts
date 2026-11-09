// Only std's error-kind entry: a single file with no imports, copied into the
// published kit, so the kit still brings in no outside code.
import type { ErrorKind } from "@halonicjs/std/error-kind";

/** Why the kit refused a request or a token. */
export type RefusalCode =
  | "bad-url"
  | "scheme-not-allowed"
  | "host-not-allowed"
  | "secret-not-declared"
  | "placement-not-in-sheet"
  | "secret-not-allowed-for-host"
  | "secret-over-plain-http"
  | "secret-not-configured"
  | "secret-needs-form-body"
  | "body-not-supported"
  | "too-many-redirects"
  | "request-too-large"
  | "secret-in-request"
  | "response-too-large"
  | "token-not-declared";

/**
 * How a surface should respond to each refusal (see `ErrorKind` in
 * `@halonicjs/std`). A request that is wrong in itself is `invalid_input`, a
 * response too large to take is `unavailable`, and everything the
 * permission sheet doesn't allow is `denied`.
 */
const refusalKinds: Readonly<Record<RefusalCode, ErrorKind>> = {
  "bad-url": "invalid_input",
  "scheme-not-allowed": "denied",
  "host-not-allowed": "denied",
  "secret-not-declared": "denied",
  "placement-not-in-sheet": "denied",
  "secret-not-allowed-for-host": "denied",
  "secret-over-plain-http": "denied",
  "secret-not-configured": "denied",
  "secret-needs-form-body": "invalid_input",
  "body-not-supported": "invalid_input",
  "too-many-redirects": "denied",
  "request-too-large": "invalid_input",
  "secret-in-request": "denied",
  "response-too-large": "unavailable",
  "token-not-declared": "denied",
};

/**
 * The kit refused something the permission sheet doesn't allow. The message
 * names the integration, the host and the path, never a query, a header or a
 * secret value, so it is safe to show and to log.
 *
 * @example
 * try { await host.http.fetch("https://evil.example/") }
 * catch (error) { if (error instanceof IntegrationRefusedError) console.log(error.code) } // "host-not-allowed"
 */
export class IntegrationRefusedError extends Error {
  override readonly name = "IntegrationRefusedError";
  readonly code: RefusalCode;
  readonly kind: ErrorKind;

  constructor(code: RefusalCode, message: string) {
    super(message);
    this.code = code;
    this.kind = refusalKinds[code];
  }
}

/**
 * A request ran out of time: no headers, no data for the idle time, or not
 * finished within the overall limit. Named `TimeoutError` like the error of
 * `AbortSignal.timeout`, and safe to show like {@link IntegrationRefusedError}.
 * A retry may work, so its kind is `unavailable`.
 */
export class IntegrationTimeoutError extends Error {
  override readonly name = "TimeoutError";
  readonly kind: ErrorKind = "unavailable";
}
