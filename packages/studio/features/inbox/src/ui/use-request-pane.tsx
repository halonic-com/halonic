import { Button, PlusIcon, useToastStore } from "@halonicjs/studio-kit";
import type { EngineWords } from "@halonicjs/studio-shell";
import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { Inbox } from "../inbox.ts";
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
  /** The workspace's Inbox, which can ask for the form (`Inbox.requestNewRequest`). */
  readonly inbox: Inbox;
  readonly requests: InboxRequests | undefined;
  readonly phone: boolean;
  readonly list: RefObject<HTMLElement | null>;
  readonly closeItem: () => void;
  readonly words: EngineWords;
  /** Opens a run's page, for **Open run** on the toast; without it the toast has no button. */
  readonly openRun?: ((hubId: string, runId: string) => void) | undefined;
  /** Hears the run a sent request started, so its card can open by itself. */
  readonly onStarted?: ((runId: string) => void) | undefined;
}): RequestPane {
  const { inbox, requests, phone, list, closeItem, words, openRun, onStarted } = options;
  const offered = useOffered(phone ? undefined : requests);
  const [draft, setDraft] = useState(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [notStarted, setNotStarted] = useState("");
  const toasts = useToastStore();
  const message = useRef<HTMLTextAreaElement>(null);
  const formAsked = useRef(false);
  const [asks, setAsks] = useState(0);
  const closeLatest = useRef(closeItem);
  closeLatest.current = closeItem;
  useEffect(() => {
    const take = () => {
      if (!inbox.takeNewRequest()) return;
      formAsked.current = true;
      closeLatest.current();
      setAsks((count) => count + 1);
    };
    take();
    return inbox.subscribe(take);
  }, [inbox]);
  // Focus goes to Message once the form is in the pane, which may be after the offered list loads.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `asks` and `offered` say the form may have appeared.
  useEffect(() => {
    if (formAsked.current && message.current !== null) {
      message.current.focus();
      formAsked.current = false;
    }
  }, [asks, offered.length]);
  if (requests === undefined || offered.length === 0) return { newRequest: null, form: null };
  const send = async (workflow: RequestWorkflow, text: string) => {
    if (busy) return;
    setNotStarted("");
    setBusy(true);
    try {
      const started = await requests.start(workflow.key, text);
      setDraft((d) => ({ ...d, message: "" }));
      onStarted?.(started.runId);
      toasts?.show({
        tone: "success",
        title: `${workflow.label} started`,
        ...(openRun && {
          action: { label: "Open run", onClick: () => openRun(started.hubId, started.runId) },
        }),
      });
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
