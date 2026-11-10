import type { Infer } from "@halonicjs/schema-kit";
import { s } from "@halonicjs/schema-kit";

/**
 * The MCP results we read, tools only (migration checklist K12: resources,
 * prompts and OAuth come later). Each schema describes only the fields we
 * use, so a new field from a newer server doesn't break us.
 * https://modelcontextprotocol.io/specification/2025-11-25/server/tools
 */

/** Protocol versions we speak, newest first. We ask for the first. */
export const supportedProtocolVersions = ["2025-11-25", "2025-06-18", "2025-03-26"] as const;

/** The server's answer to `initialize`. */
export const initializeResultSchema = s.object({
  protocolVersion: s.string().max(64),
  capabilities: s.object({
    tools: s.object({ listChanged: s.boolean().optional() }).optional(),
  }),
});

/**
 * The spec's rule for tool names, which keeps them safe to show and to
 * match. Halonic's rule for the tools an integration lists is narrower (no
 * `.`, at most 64 characters); an integration that lists tools applies it.
 */
export const toolNamePattern = /^[A-Za-z0-9_.-]{1,128}$/;

/**
 * The `_meta` keys where a server may say what a tool can do, in
 * `ConnectorTool` terms. MCP has no field for it. Like the annotations,
 * they are the server's claim: the host decides what to trust.
 */
export const toolMetaKeys = {
  risk: "com.halonic/risk",
  untrusted: "com.halonic/untrusted",
} as const;

/** One tool in a `tools/list` page. */
export const toolSchema = s.object({
  name: s.string().regex(toolNamePattern),
  description: s.string().max(10_000).optional(),
  inputSchema: s.object({ type: s.literal("object") }).passthrough(),
  // Hints only: a server can claim anything, so they never lower a tool's risk on their own.
  annotations: s
    .object({
      readOnlyHint: s.boolean().optional(),
      destructiveHint: s.boolean().optional(),
      idempotentHint: s.boolean().optional(),
      openWorldHint: s.boolean().optional(),
    })
    .optional(),
  _meta: s
    .object({
      [toolMetaKeys.risk]: s.enum(["read", "write", "send"]).optional(),
      [toolMetaKeys.untrusted]: s.boolean().optional(),
    })
    .optional(),
});

/** A tool the server offers, as the server describes it. Its text is the server's. */
export type McpTool = Infer<typeof toolSchema>;

/** One page of the server's answer to `tools/list`. */
export const listToolsResultSchema = s.object({
  tools: s.array(toolSchema),
  nextCursor: s.string().max(1024).optional(),
});

const textContentSchema = s.object({ type: s.literal("text"), text: s.string() });
const otherContentSchema = s.object({ type: s.string().max(64) });

/** The server's answer to `tools/call`. */
export const callToolResultSchema = s.object({
  content: s.array(s.union([textContentSchema, otherContentSchema])),
  isError: s.boolean().optional(),
});

/** One piece of a tool's answer. Images, audio and resources are named, not kept, for now. */
export type McpContent =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "other"; readonly kind: string };

/** What a tool call returned. `isError` is the tool's own failure, which the model may read. */
export interface McpToolResult {
  readonly content: readonly McpContent[];
  readonly isError: boolean;
}

/** Keeps the text of a tool's answer and names every other kind of content. */
export function toToolResult(result: Infer<typeof callToolResultSchema>): McpToolResult {
  const content = result.content.map(
    (item): McpContent =>
      "text" in item ? { type: "text", text: item.text } : { type: "other", kind: item.type },
  );
  return { content, isError: result.isError === true };
}
