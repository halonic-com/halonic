import type { ReactNode } from "react";

/**
 * The Inbox's empty state (microcopy 10.1). The desktop list says the short line and the right pane
 * only the description, so the title shows once; a phone has no pane beside the list, so the list
 * shows both in full.
 */
export const nothingWaiting = {
  title: "Nothing is waiting for you",
  description: "Approvals and questions from your runs show up here.",
};

/**
 * The right pane with nothing open (UX checklist 2.3): the request form when the workspace offers
 * one (`form`), else a line.
 */
export function NothingOpen({
  loaded,
  waiting,
  children: form,
}: {
  readonly loaded: boolean;
  readonly waiting: number;
  readonly children: ReactNode;
}) {
  if (!loaded) return null;
  if (form !== null) return form;
  if (waiting > 0) {
    return (
      <p className="m-auto p-6 text-center text-body text-fg-muted">
        Pick something on the left to see it here.
      </p>
    );
  }
  return (
    <p className="m-auto p-6 text-center text-body text-fg-muted">{nothingWaiting.description}</p>
  );
}
