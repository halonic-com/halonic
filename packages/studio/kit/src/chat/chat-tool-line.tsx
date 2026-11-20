import type { ComponentType } from "react";
import { Spinner } from "../button/spinner.tsx";
import { AlertIcon } from "../icons/alert-icon.tsx";
import { TickIcon } from "../icons/tick-icon.tsx";

/** Where a tool call is: still running, finished, or failed. */
export type ChatToolState = "running" | "done" | "failed";

/** The props of `ChatToolLine`. */
export interface ChatToolLineProps {
  readonly state: ChatToolState;
  /** The feature's words for the call: "Searching pages…", "Searched pages". */
  readonly children: string;
}

const marks: Record<ChatToolState, { icon: ComponentType; colour: string }> = {
  running: { icon: Spinner, colour: "text-fg-subtle" },
  done: { icon: TickIcon, colour: "text-fg-subtle" },
  failed: { icon: AlertIcon, colour: "text-danger" },
};

/**
 * One quiet line for a tool call inside a reply: a 16px mark, then the words in `text-small`
 * `fg-muted`. The mark says how the call went: the busy spinner while it runs, a tick when it's
 * done, the alert mark in `danger` when it failed. The words say it too, so the mark is hidden
 * from screen readers. Not a live region: a reply is read when it ends, not step by step.
 *
 * @example
 * <ChatToolLine state="done">Searched pages</ChatToolLine>
 */
export function ChatToolLine({ state, children }: ChatToolLineProps) {
  const { icon: Mark, colour } = marks[state];
  return (
    <p className="flex items-start gap-2 text-small text-fg-muted" data-tool-state={state}>
      <span
        aria-hidden="true"
        className={`mt-0.5 inline-grid size-icon-sm shrink-0 place-items-center *:size-full ${colour}`}
      >
        <Mark />
      </span>
      <span className="min-w-0 wrap-break-word">{children}</span>
    </p>
  );
}
