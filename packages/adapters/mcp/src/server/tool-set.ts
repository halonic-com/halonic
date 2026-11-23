/** One tool as MCP's `tools/list` names it. */
export interface McpTool {
  name: string;
  description: string;
  /** A JSON Schema for the arguments; MCP needs it to be of type `object`. */
  inputSchema: Record<string, unknown>;
}

/** What a tool call gives the program: its text, and whether it is an error result. */
export interface McpToolCallResult {
  text: string;
  isError: boolean;
}

/**
 * The tools one MCP server offers and how it answers a call to them. The
 * {@link McpToolServer} speaks the protocol; a tool set decides what the
 * tools are and what a call does.
 */
export interface McpToolSet {
  /** The tools offered, in order. */
  list(): Promise<McpTool[]>;
  /**
   * Answers one call. A tool that fails answers with an error result; a
   * throw is a failure inside Halonic, whose text the program never reads.
   */
  call(
    name: string,
    args: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<McpToolCallResult>;
}
