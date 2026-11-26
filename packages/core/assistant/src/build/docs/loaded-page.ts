// What untrusted text can't do once it is loaded in a Build chat
// (`assistant.build.loaded-page`). It is loaded once a `read_docs` result
// with anything a site sent, a page or a redirect, or a `read_request_log`
// result with the log's lines is in the chat's messages, and it stays loaded
// for the rest of the chat. From then on the chat offers only the builder's
// own tools, and `read_docs` asks only for sites the person named. Both are
// read from the messages before each model turn and on each call, so text
// loaded in the middle of an answer counts from the next turn on.

import { type ChatTool, fenceStart } from "@halonicjs/app";
import type { ChatMessage, ToolCall } from "@halonicjs/ports";
import { docsTexts } from "./docs-texts.ts";
import { checkDocsUrl, loggedUrl } from "./docs-url.ts";

/**
 * The Build chat's own tools: the only ones a chat offers while untrusted text is loaded. A tool
 * added to the chat later, such as a connector's or a run's, isn't one of them, so a page or a
 * request log can't reach it.
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
  "read_request_log",
];

/**
 * The tools a turn offers: all of `tools` until untrusted text is loaded in `messages`, then only
 * those in {@link builderToolNames}. Give it to the chat service as `offerTools`, so it is checked
 * again before each model turn (`app.chat-tools-per-turn`).
 */
export function toolsWhileUntrustedLoaded(
  tools: readonly ChatTool[],
  messages: readonly ChatMessage[],
): readonly ChatTool[] {
  if (!untrustedTextLoaded(messages)) return tools;
  return tools.filter((tool) => builderToolNames.includes(tool.definition.name));
}

/** Whether untrusted text is loaded in `messages`: a docs page, or a request log's lines. */
export function untrustedTextLoaded(messages: readonly ChatMessage[]): boolean {
  return sitesRead(messages).length > 0 || requestLogRead(messages);
}

/**
 * Whether a `read_request_log` result with the log's lines is in `messages`. Its answers without
 * lines, such as for an untrusted workspace or an empty log, hold no fence and don't count.
 */
function requestLogRead(messages: readonly ChatMessage[]): boolean {
  const logCalls = new Set(
    messages
      .flatMap((message) =>
        message.role === "assistant"
          ? (message.toolCalls ?? []).filter((call) => call.name === "read_request_log")
          : [],
      )
      .map((call) => call.id),
  );
  return messages.some(
    (message) =>
      message.role === "tool" &&
      logCalls.has(message.toolCallId) &&
      message.content.includes(fenceStart),
  );
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
 * The site a `read_docs` call loaded something from, or `undefined` when nothing came from a site.
 * Whatever a site sent counts, not only a page: a redirect names a target the site chose, outside
 * the untrusted fence (Liam, HAL-18399), and a status or a failure is the site's doing too. So
 * every result counts but the answers `read_docs` gives before any request: a refused address,
 * an untrusted workspace, and a site that is waiting, declined or not named.
 */
export function pageSiteOf(call: ToolCall, result: string): string | undefined {
  if (call.name !== "read_docs") return undefined;
  const url = call.arguments["url"];
  const raw = typeof url === "string" ? url : "";
  const checked = checkDocsUrl(raw);
  if ("refused" in checked) {
    // A page is only read from an address that passes the check, but a fenced result counts as
    // loaded even if it somehow didn't, named by the address as the log keeps it.
    return result.includes(fenceStart) ? loggedUrl(raw) : undefined;
  }
  return beforeAnyRequest(checked.host).includes(result) ? undefined : checked.host;
}

/** The results `read_docs` gives for an address on `host` without sending any request. */
function beforeAnyRequest(host: string): readonly string[] {
  return [
    docsTexts.untrusted,
    docsTexts.waiting(host),
    docsTexts.declined(host),
    docsTexts.notNamed(host),
  ];
}
