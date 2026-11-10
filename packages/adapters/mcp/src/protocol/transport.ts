import type { OutgoingMessage } from "./json-rpc.ts";

/**
 * The parts of an `AbortSignal` the session uses: it only reads `aborted`
 * and passes the signal on. A real `AbortSignal` fits. It is narrowed so
 * this folder needs no Web or Node types, and an integration can import it
 * as it is.
 */
export interface AbortSignalLike {
  readonly aborted: boolean;
}

/**
 * Carries JSON-RPC messages between the session and one MCP server. The
 * session doesn't know how: over HTTP each request gets its own answer
 * stream; over stdio one stream is shared and answers are routed by id.
 */
export interface McpTransport {
  /**
   * Sends one message. For a request, yields every message the server
   * sends while answering it, as unchecked JSON values, and ends after the
   * answer. For a notification or a response, yields nothing.
   *
   * @throws {McpError} when the server can't be reached or refuses the message
   */
  send(message: OutgoingMessage, signal?: AbortSignalLike): AsyncIterable<unknown>;

  /** Called once the version is agreed; HTTP sends it with every later request. */
  useProtocolVersion(version: string): void;

  /** Ends the session on the server, if it keeps one. */
  close(signal?: AbortSignalLike): Promise<void>;
}
