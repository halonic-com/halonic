import { AlertIcon } from "../icons/alert-icon.tsx";
import { type ChatAction, ChatActions } from "./chat-actions.tsx";

/**
 * `danger` for a reply that failed: "Couldn't reach the model…". `plain` for a reply that ended
 * some other way: "Stopped by you.", "Some tool calls already ran. Send a new message to continue."
 */
export type ChatEndLineTone = "danger" | "plain";

/** The props of `ChatEndLine`. */
export interface ChatEndLineProps {
  readonly tone: ChatEndLineTone;
  /** The whole sentence, never shortened: it wraps. */
  readonly children: string;
  /**
   * What the line offers: **Try again** only when no tool ran yet, since sending again could
   * repeat what a tool did. A failure after a tool ran has none.
   */
  readonly actions?: readonly ChatAction[];
}

const toneClasses: Record<ChatEndLineTone, string> = {
  danger: "text-danger",
  plain: "text-fg-muted",
};

/**
 * The line that ends a reply, under the last step it showed: why it stopped or failed, and what
 * to do next. A `danger` line starts with the alert mark, so the failure doesn't rest on colour.
 * It isn't a live region: the feature announces the end of a reply through the shell's
 * announcer, once.
 *
 * @example
 * <ChatEndLine tone="danger" actions={[{ label: "Try again", onClick: sendAgain }]}>
 *   Sorter's reply failed: Anthropic was busy.
 * </ChatEndLine>
 * <ChatEndLine tone="plain">Stopped by you.</ChatEndLine>
 */
export function ChatEndLine({ tone, children, actions = [] }: ChatEndLineProps) {
  return (
    <div className="flex flex-col items-start gap-2">
      <p className={`flex items-start gap-2 text-small ${toneClasses[tone]}`}>
        {tone === "danger" ? (
          <span
            aria-hidden="true"
            className="mt-0.5 inline-grid size-icon-sm shrink-0 place-items-center *:size-full"
          >
            <AlertIcon />
          </span>
        ) : null}
        <span className="min-w-0 wrap-break-word">{children}</span>
      </p>
      <ChatActions actions={actions} />
    </div>
  );
}
