// The prompt of a chat turn that runs in a harness. Each message starts a
// new harness call, and the program remembers nothing from the last one, so
// the prompt carries the conversation so far along with the new message.

import type { ChatMessage } from "@halonicjs/ports";

/**
 * The prompt for the person's last message, with the earlier messages of
 * the person and the agent before it. System and tool messages are left
 * out: the agent's instructions come from its file, and a harness is
 * offered none of the caller's tools.
 *
 * @throws when the last message isn't the person's
 */
export function chatPrompt(messages: readonly ChatMessage[]): string {
  const last = messages.at(-1);
  if (last?.role !== "user") {
    throw new Error("A chat turn with a harness agent needs the person's message last.");
  }
  const earlier = messages.slice(0, -1).flatMap(conversationLine);
  if (earlier.length === 0) return last.content;
  return [
    "Here is the conversation so far:",
    ...earlier,
    "The person's new message:",
    last.content,
  ].join("\n\n");
}

/** A message of the person or the agent as one line of the conversation; none for the rest. */
function conversationLine(message: ChatMessage): string[] {
  switch (message.role) {
    case "user":
      return [`The person: ${message.content}`];
    case "assistant":
      return message.content === "" ? [] : [`You: ${message.content}`];
    default:
      return [];
  }
}
