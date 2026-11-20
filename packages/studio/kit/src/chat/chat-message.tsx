import type { ReactNode } from "react";

/** A message the person sent, shown on the right in a tinted box. */
interface YourMessage {
  readonly from: "you";
  /** The message as it was sent. */
  readonly children: string;
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
  /** Its steps in order: `ChatText`, `ChatToolLine`, and a `ChatEndLine` last when it has one. */
  readonly children: ReactNode;
}

/** The props of `ChatMessage`. */
export type ChatMessageProps = YourMessage | ReplyMessage;

/**
 * One message row of a chat transcript. The person's message sits on the right in a
 * `surface-muted` box at most four fifths wide; a reply takes the full width, with no box, under
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
        <p className="max-w-4/5 rounded-md bg-surface-muted px-3 py-2 text-reading text-fg whitespace-pre-wrap wrap-break-word">
          {props.children}
        </p>
      </div>
    );
  }
  const Heading = `h${props.headingLevel ?? 3}` as const;
  return (
    <div className="flex flex-col gap-2" data-chat-message="reply">
      <Heading className="sr-only">{props.heading}</Heading>
      {props.children}
    </div>
  );
}

/** The props of `ChatText`. */
export interface ChatTextProps {
  /** What the model wrote in one step, as plain text. */
  readonly children: string;
}

/**
 * A step of a reply that's text: `text-reading` in `fg`, keeping the model's line breaks.
 *
 * @example
 * <ChatText>It's about a refund.</ChatText>
 */
export function ChatText({ children }: ChatTextProps) {
  return <p className="text-reading text-fg whitespace-pre-wrap wrap-break-word">{children}</p>;
}
