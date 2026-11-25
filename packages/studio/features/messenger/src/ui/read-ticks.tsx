import type { Message } from "@halonicjs/ports";
import { decidedAt, Tooltip } from "@halonicjs/studio-kit";
import { messengerWords } from "../messenger-words.ts";

/**
 * The ticks after the time under the person's sent message (`messenger.read-receipts`): one once
 * it was sent, two once the chat's agent picked it up (`readAt`). A screen reader hears "Sent" or
 * "Read 19:02", and the pointer sees the same words as a tooltip.
 */
export function ReadTicks({ message }: { readonly message: Message }) {
  const read = message.readAt !== undefined;
  const words =
    message.readAt === undefined
      ? messengerWords.sent
      : messengerWords.readAt(decidedAt(new Date(message.readAt)));
  return (
    <Tooltip text={words} visualOnly>
      {() => (
        <span data-ticks={read ? "read" : "sent"} className="inline-flex items-center">
          <Tick />
          {read ? <Tick second /> : null}
          <span className="sr-only">{words}</span>
        </span>
      )}
    </Tooltip>
  );
}

/** One check mark, 12px; the second overlaps the first, as two ticks do. */
function Tick({ second = false }: { readonly second?: boolean }) {
  return (
    <svg
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
      className={`size-3 ${second ? "-ms-1.5" : ""}`}
    >
      <path
        d="M2 6.5 4.5 9 10 3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
