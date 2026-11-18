/**
 * A connector's tool that answered, but with an error of its own (MCP's
 * `isError`), such as a file tool that found no file. The server did answer,
 * so the call didn't break off: the engine logs it as a failed call, with the
 * tool's own text, and the agent goes on (requirement
 * `ports.connector-tool-error`). A call that got no answer at all, because
 * the program died, the connection dropped or it ran out of time, throws any
 * other error instead.
 *
 * The message is Halonic's; the tool's own text, which the server wrote, is
 * kept apart in `toolText`, so a reader can fence it as untrusted.
 *
 * Check for it with {@link isConnectorToolError}, not `instanceof`: an
 * adapter may be built against its own copy of this package.
 *
 * @example
 * if (result.isError) throw new ConnectorToolError("handbook-files", "read_text_file", "ENOENT: …");
 */
export class ConnectorToolError extends Error {
  override readonly name = "ConnectorToolError";
  /** What the tool said about its failure: the server's text. */
  readonly toolText: string;

  constructor(connectorId: string, toolName: string, toolText: string) {
    super(`Connector "${connectorId}" says its tool "${toolName}" failed.`);
    this.toolText = toolText;
  }
}

/**
 * Whether `value` is a {@link ConnectorToolError}: an `Error` named
 * "ConnectorToolError" with a `toolText` string. It works across copies of
 * this package, where `instanceof` doesn't.
 *
 * @example
 * const outcome = isConnectorToolError(error) ? "error" : "unknown";
 */
export function isConnectorToolError(value: unknown): value is ConnectorToolError {
  if (!(value instanceof Error) || value.name !== "ConnectorToolError") return false;
  return typeof (value as { toolText?: unknown }).toolText === "string";
}
