/** Why the kit refused a request or a token. */
export type RefusalCode =
  | "bad-url"
  | "scheme-not-allowed"
  | "host-not-allowed"
  | "secret-not-declared"
  | "secret-not-allowed-for-host"
  | "secret-not-configured"
  | "secret-needs-form-body"
  | "body-not-supported"
  | "too-many-redirects"
  | "response-too-large"
  | "token-not-declared";

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

  constructor(code: RefusalCode, message: string) {
    super(message);
    this.code = code;
  }
}
