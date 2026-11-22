/**
 * What went wrong talking to an MCP server. The first codes are the
 * integration guide's (section 7); the MCP ones:
 *
 * - `unsupported-version`: the server speaks no protocol version we do;
 * - `session-expired`: the server forgot the session; connect again.
 */
export type McpErrorCode =
  | "bad-arguments"
  | "not-signed-in"
  | "not-allowed"
  | "not-found"
  | "rate-limited"
  | "unavailable"
  | "unexpected-response"
  | "unsupported-version"
  | "session-expired";

/**
 * The MCP client's one error type. Its message is ours, written for the
 * user: never the server's text, which a hostile server can fill with
 * anything.
 */
export class McpError extends Error {
  /** `McpError`, or a subclass's own name, as `ProgramStoppedAtStartError` gives it. */
  override readonly name: string = "McpError";
  /** What went wrong, for code that reacts to it. */
  readonly code: McpErrorCode;
  /**
   * Set when the server didn't answer within this many milliseconds, so the
   * request was given up; a connector turns that into the engine's
   * `ConnectorToolTimeoutError` for a tool call.
   */
  readonly timeoutMs?: number;

  constructor(code: McpErrorCode, message: string, options?: { readonly timeoutMs?: number }) {
    super(message);
    this.code = code;
    if (options?.timeoutMs !== undefined) this.timeoutMs = options.timeoutMs;
  }
}

/**
 * The server or its program stopped, or didn't answer in time, before it
 * answered a request. It is an `unavailable` {@link McpError} as before; its
 * own type lets a caller say "it stopped" without reading the message.
 */
export class McpStoppedError extends McpError {
  constructor(message: string, options?: { readonly timeoutMs?: number }) {
    super("unavailable", message, options);
  }
}

/** The server answered with something we can't read. */
export function unexpectedResponse(): McpError {
  return new McpError("unexpected-response", "The MCP server answered in an unexpected way.");
}
