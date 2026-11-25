// What a docs page can't do once it is loaded in a Build chat
// (`assistant.build.loaded-page`). A page is loaded once a `read_docs`
// result that holds one is in the chat's messages, and it stays loaded for
// the rest of the chat. From then on the chat offers only the builder's own
// tools, and `read_docs` asks only for sites the person named. Both are
// read from the messages before each model turn and on each call, so a page
// read in the middle of an answer counts from the next turn on.

import { type ChatTool, fenceStart } from "@halonicjs/app";
import type { ChatMessage, ToolCall } from "@halonicjs/ports";
import { checkDocsUrl, loggedUrl } from "./docs-url.ts";

/**
 * The Build chat's own tools: the only ones a chat offers while a page is loaded. A tool added
 * to the chat later, such as a connector's or a run's, isn't one of them, so a page can't reach it.
 */
export const builderToolNames: readonly string[] = [
  "list_files",
  "read_file",
  "schema",
  "integration_guide",
  "validate",
  "propose_file",
  "propose_delete",
  "show",
  "read_docs",
];

/**
 * The tools a turn offers: all of `tools` until a page is loaded in `messages`, then only those
 * in {@link builderToolNames}. Give it to the chat service as `offerTools`, so it is checked
 * again before each model turn (`app.chat-tools-per-turn`).
 */
export function toolsWhilePageLoaded(
  tools: readonly ChatTool[],
  messages: readonly ChatMessage[],
): readonly ChatTool[] {
  if (sitesRead(messages).length === 0) return tools;
  return tools.filter((tool) => builderToolNames.includes(tool.definition.name));
}

/** The sites of the pages loaded in `messages`, each once, in the order they were first read. */
export function sitesRead(messages: readonly ChatMessage[]): readonly string[] {
  return sitesReadBefore(messages, undefined);
}

/**
 * The sites of the pages loaded in `messages` before the result of the tool call `callId`, such
 * as a proposal's: its card says it was written after reading them. Every page in `messages` when
 * `callId` is `undefined` or has no result.
 */
export function sitesReadBefore(
  messages: readonly ChatMessage[],
  callId: string | undefined,
): readonly string[] {
  const calls = new Map<string, ToolCall>();
  const sites = new Set<string>();
  for (const message of messages) {
    if (message.role === "assistant") {
      for (const call of message.toolCalls ?? []) calls.set(call.id, call);
    }
    if (message.role !== "tool") continue;
    if (message.toolCallId === callId) break;
    const call = calls.get(message.toolCallId);
    const site = call === undefined ? undefined : pageSiteOf(call, message.content);
    if (site !== undefined) sites.add(site);
  }
  return [...sites];
}

/**
 * The site of the page a `read_docs` call loaded, or `undefined` when its result holds none. A
 * result holds a page when it holds the untrusted fence, which only a page's text is put in.
 */
function pageSiteOf(call: ToolCall, result: string): string | undefined {
  if (call.name !== "read_docs" || !result.includes(fenceStart)) return undefined;
  const url = call.arguments["url"];
  const raw = typeof url === "string" ? url : "";
  const checked = checkDocsUrl(raw);
  // A page is only read from an address that passes the check, but a fenced result counts as
  // loaded even if it somehow didn't, named by the address as the log keeps it.
  return "refused" in checked ? loggedUrl(raw) : checked.host;
}
