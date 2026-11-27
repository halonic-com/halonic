import type { ReactNode } from "react";

/** A message the person sent, shown on the right in a tinted box. */
interface YourMessage {
  readonly from: "you";
  /** The message as it was sent: words, or host text with its hidden characters as chips. */
  readonly children: ReactNode;
}

/** A reply from the agent or the assistant, built step by step. */
interface ReplyMessage {
  readonly from: "reply";
  /**
   * The reply's hidden heading, so heading keys jump from reply to reply: "Sorter said",
   * "The assistant said".
   */
  readonly heading: string;
  /** The heading's level under the chat's own heading. Default 3. */
  readonly headingLevel?: 2 | 3 | 4;
  /** The reply is still being written: `aria-busy` until it ends (`kit.chat-reply-busy`). */
  readonly busy?: boolean | undefined;
  /** Its steps in order: `ChatText`, `ChatToolLine`, and a `ChatEndLine` last when it has one. */
  readonly children: ReactNode;
}

/** The props of `ChatMessage`. */
export type ChatMessageProps = YourMessage | ReplyMessage;

/**
 * One message row of a chat transcript. The person's message sits on the right in a
 * own-message bubble at most 65% wide; a reply takes the full width, with no box, under
 * a heading only screen readers see. Both keep the text's line breaks and wrap long words.
 *
 * @example
 * <ChatMessage from="you">Sort this mail</ChatMessage>
 * <ChatMessage from="reply" heading="Sorter said">
 *   <ChatToolLine state="done">Read the mail</ChatToolLine>
 *   <ChatText>It's about a refund.</ChatText>
 * </ChatMessage>
 */
export function ChatMessage(props: ChatMessageProps) {
  if (props.from === "you") {
    return (
      <div className="flex justify-end" data-chat-message="you">
        {/* The new design's bubble (HAL-20728): 7.5px corners, padding 6 / 7 / 8 / 9px and its
            one-pixel shadow, at most 65% wide (`kit.chat-message-corner`). */}
        <p className="max-w-[65%] rounded-bubble bg-surface-own-message pt-[6px] pr-[7px] pb-2 pl-[9px] text-body text-fg shadow-bubble whitespace-pre-wrap wrap-break-word">
          {props.children}
        </p>
      </div>
    );
  }
  const Heading = `h${props.headingLevel ?? 3}` as const;
  return (
    <div
      className="flex flex-col gap-2"
      data-chat-message="reply"
      aria-busy={props.busy === true ? true : undefined}
    >
      <Heading className="sr-only">{props.heading}</Heading>
      {props.children}
    </div>
  );
}
