import type { ChatMessage } from "@halonicjs/ports";

/**
 * What the model reads: the chat, then the person's message with the notes on the cards they
 * decided before it (flow-assistant 3.3). The notes aren't kept: the cards already say it.
 */
export function forTheModel(
  kept: readonly ChatMessage[],
  sent: ChatMessage | undefined,
  notes: readonly string[],
): readonly ChatMessage[] {
  if (notes.length === 0) return sent === undefined ? kept : [...kept, sent];
  const said = notes.join("\n");
  if (sent === undefined) return [...kept, { role: "user", content: said }];
  return [...kept, { role: "user", content: `${said}\n\n${sent.content}` }];
}
