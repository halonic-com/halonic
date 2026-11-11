// Step two of three the HAL-803 rules plug into (HAL-998): when a turn
// offers a server's tools, the system prompt says who wrote their fenced
// texts (`ports.untrusted-tool-listings`). The line is fixed, names no tool
// and quotes nothing a server wrote.

import { listedToolsNotice } from "@halonicjs/app";
import type { ChatMessage } from "@halonicjs/ports";
import { offeredTool } from "./check-run-tool-call.ts";
import type { TurnTool } from "./turn-tools.ts";

/**
 * The messages a model call sends: as they are when no server's tool is
 * offered, and otherwise with the notice at the end of the first system
 * message, or in a system message of its own in front when there is none.
 * Only the request gets it, so a stopped turn's history doesn't keep it.
 */
export function withListedToolsNotice(
  messages: readonly ChatMessage[],
  tools: readonly TurnTool[],
): ChatMessage[] {
  const notice = listedToolsNotice(tools.flatMap((tool) => offeredTool(tool) ?? []));
  if (notice === null) {
    return [...messages];
  }
  const [first, ...rest] = messages;
  if (first?.role === "system") {
    return [{ role: "system", content: `${first.content}\n\n${notice}` }, ...rest];
  }
  return [{ role: "system", content: notice }, ...messages];
}
