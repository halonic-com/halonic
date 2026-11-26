import type { Message } from "@halonicjs/ports";
import type { PendingMessage } from "../chat-layout.ts";
import { chatAgent } from "../chat-name.ts";
import type { ConversationRow } from "../messenger.ts";
import { messengerWords } from "../messenger-words.ts";
import { ShowActivity } from "./activity-toggle.tsx";

/**
 * Whether the chat's agent shows as typing (`messenger.typing`): its source says the agent has a
 * started run on the chat (`agentWorking`), and nothing it wrote came after the person's last
 * message, sent or on its way. A search shows only some messages, so it never shows then, nor
 * before the messages' first read landed. An offline source's last read can't say the run still
 * goes on, so it never shows while the source isn't online either (`messenger.typing-offline`).
 */
export function agentTyping(
  row: ConversationRow,
  messages: readonly Message[] | undefined,
  pending: readonly PendingMessage[],
  searching: boolean,
): boolean {
  if (row.conversation.agentWorking !== true || searching || messages === undefined) return false;
  if (row.source?.state.kind !== "online") return false;
  if (pending.length > 0) return true;
  const newest = messages.at(-1);
  return newest === undefined || newest.author.kind === "me";
}

/**
 * "Chief is typing…" under the transcript, after three dots that pulse one after another, and stand
 * still under reduced motion. While the activity panel is closed, the line offers **Show
 * activity** (`messenger.activity-panel`). Its status region is always there, so a screen reader hears the
 * line when it appears, once.
 */
export function TypingLine({
  row,
  typing,
}: {
  readonly row: ConversationRow;
  readonly typing: boolean;
}) {
  const name = chatAgent(row)?.name ?? row.conversation.title;
  return (
    <div role="status" className="mx-auto w-full max-w-[800px] px-4">
      {typing ? (
        // pt-2: the agent's reply opens a new run 24px under your bubble, so the line sits there too.
        <p data-typing className="flex items-center gap-2 pt-2 pb-4 ps-9 text-small text-fg-muted">
          <span aria-hidden="true" className="flex gap-1">
            {["", "[animation-delay:200ms]", "[animation-delay:400ms]"].map((delay) => (
              <span
                key={delay}
                className={`size-1.5 rounded-full bg-fg-muted forced-color-adjust-none forced-colors:bg-[CanvasText] motion-safe:animate-typing ${delay}`}
              />
            ))}
          </span>
          {messengerWords.typing(name)}
          <ShowActivity />
        </p>
      ) : null}
    </div>
  );
}
