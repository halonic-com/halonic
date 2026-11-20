import type { ReactNode } from "react";
import { WarningIcon } from "../icons/warning-icon.tsx";
import { type ChatAction, ChatActions } from "./chat-actions.tsx";

/**
 * `warning` for what stops a message from going out: no key, the budget, a harness that isn't
 * ready, a key in the message. `muted` for a calm fact about the chat: "Not trusted yet · it can
 * read and propose, but not run anything."
 */
export type ChatBoxLineTone = "warning" | "muted";

/** The props of `ChatBoxLine`. */
export interface ChatBoxLineProps {
  readonly tone: ChatBoxLineTone;
  /** The sentence, never shortened. It may hold code, such as the alias `smart`. */
  readonly children: ReactNode;
  /** What it offers, after the sentence: "Set the key ›", "Go to the key field ›" · "Send anyway". */
  readonly actions?: readonly ChatAction[];
}

const toneClasses: Record<ChatBoxLineTone, string> = {
  warning: "text-fg",
  muted: "text-fg-muted",
};

/**
 * The line under a chat's box: why a message can't go out now, and the one way to fix it. A
 * `warning` line starts with the 16px triangle in `warning`; its words stay in `fg`, so they keep
 * their contrast. The actions follow the sentence and wrap under it when there's no room.
 *
 * The composer puts it in its status region, so a screen reader reads it once when it appears.
 *
 * @example
 * <ChatBoxLine tone="warning" actions={[{ label: "Set the key ›", onClick: openKey, look: "link" }]}>
 *   Sorter has no model it can use: <code>smart</code> needs an API key for Anthropic.
 * </ChatBoxLine>
 */
export function ChatBoxLine({ tone, children, actions = [] }: ChatBoxLineProps) {
  return (
    <div className={`flex items-start gap-2 text-small ${toneClasses[tone]}`}>
      {tone === "warning" ? (
        <span
          aria-hidden="true"
          className="mt-0.5 inline-grid size-icon-sm shrink-0 place-items-center text-warning *:size-full"
        >
          <WarningIcon />
        </span>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1">
        <p className="min-w-0 wrap-break-word">{children}</p>
        <ChatActions actions={actions} />
      </div>
    </div>
  );
}
