import { Button, PlusIcon, useToastStore } from "@halonicjs/studio-kit";
import type { EngineWords } from "@halonicjs/studio-shell";
import { type ReactNode, type RefObject, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { InboxRequests, RequestWorkflow } from "../request/inbox-requests.ts";
import { notStartedLine } from "../request/not-started.ts";
import { useOffered } from "../request/use-offered.ts";
import { emptyDraft, RequestForm } from "./request-form.tsx";

/** What the Inbox page needs from the request form, or nothing when there is none to offer. */
export interface RequestPane {
  /** **New request**, for the list's header; `null` with no form. */
  readonly newRequest: ReactNode;
  /** The form for the right pane while no card is open; `null` with no form. */
  readonly form: ReactNode;
}

/**
 * The request form's pieces for the Inbox page: the form, **New request** and the text you have
 * typed, which stays here while a card is open. A phone offers none yet: its request sheet is a
 * later part (HAL-10618).
 *
 * @param list The list's column: Esc in the form returns focus to its first row.
 * @param closeItem Closes the open card, so the form shows.
 */
export function useRequestPane(options: {
  readonly requests: InboxRequests | undefined;
  readonly phone: boolean;
  readonly list: RefObject<HTMLElement | null>;
  readonly closeItem: () => void;
  readonly words: EngineWords;
}): RequestPane {
  const { requests, phone, list, closeItem, words } = options;
  const offered = useOffered(phone ? undefined : requests);
  const [draft, setDraft] = useState(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [notStarted, setNotStarted] = useState("");
  const toasts = useToastStore();
  const message = useRef<HTMLTextAreaElement>(null);
  if (requests === undefined || offered.length === 0) return { newRequest: null, form: null };
  const send = async (workflow: RequestWorkflow, text: string) => {
    if (busy) return;
    setNotStarted("");
    setBusy(true);
    try {
      await requests.start(workflow.key, text);
      setDraft((d) => ({ ...d, message: "" }));
      toasts?.show({ tone: "success", title: `${workflow.label} started` });
    } catch (error) {
      setNotStarted(notStartedLine(error, words));
    } finally {
      setBusy(false);
    }
  };
  const showForm = () => {
    // The form is in the pane once the card has closed, so Message can take focus.
    flushSync(closeItem);
    message.current?.focus();
  };
  return {
    newRequest: (
      <Button variant="secondary" size="sm" icon={<PlusIcon />} onClick={showForm}>
        New request
      </Button>
    ),
    form: (
      <RequestForm
        offered={offered}
        draft={draft}
        onDraft={setDraft}
        busy={busy}
        notStarted={notStarted}
        onSend={send}
        onEscape={() => list.current?.querySelector<HTMLElement>('[role="gridcell"]')?.focus()}
        messageRef={message}
      />
    ),
  };
}
