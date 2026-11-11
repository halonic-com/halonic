// Step two of three the HAL-803 rules plug into (HAL-998): when a request
// holds fenced text, the system prompt says who wrote it
// (`ports.untrusted-tool-listings`). The line is fixed, names no tool and
// quotes nothing a server wrote.

import { fencedTextsNotice } from "@halonicjs/app";
import type { ChatMessage, ToolDefinition } from "@halonicjs/ports";

/**
 * The messages a model call sends: as they are when neither they nor the
 * offered tools hold fenced text, and otherwise with the notice at the end of
 * the first system message, or in a system message of its own in front when
 * there is none. It looks at the request, not at the tools offered, so a
 * chat that still holds a fenced result after its server is removed gets the
 * notice too. Only the request gets it, so a stopped turn's history doesn't
 * keep it.
 */
export function withFencedTextsNotice(
  messages: readonly ChatMessage[],
  tools: readonly ToolDefinition[],
): ChatMessage[] {
  const notice = fencedTextsNotice({ messages, tools });
  if (notice === null) {
    return [...messages];
  }
  const [first, ...rest] = messages;
  if (first?.role === "system") {
    return [{ role: "system", content: `${first.content}\n\n${notice}` }, ...rest];
  }
  return [{ role: "system", content: notice }, ...messages];
}
