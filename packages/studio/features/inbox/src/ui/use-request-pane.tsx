import { Button, PlusIcon, useToastStore } from "@halonicjs/studio-kit";
import type { EngineWords } from "@halonicjs/studio-shell";
import {
  type MutableRefObject,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import type { Inbox } from "../inbox.ts";
import type { InboxRequests, RequestWorkflow } from "../request/inbox-requests.ts";
import { notStartedLine } from "../request/not-started.ts";
import { useOffered } from "../request/use-offered.ts";
import { QuietLine } from "./quiet-line.tsx";
import { emptyDraft, RequestForm } from "./request-form.tsx";
import { RequestSheet } from "./request-sheet.tsx";

/** A phone's **New request** row: 48px, a plus icon, `accent-text`, a `border` line under it. */
const newRequestRowClasses = [
  "flex w-full min-h-touch items-center gap-3 border-b border-border px-4 text-left text-body text-accent-text",
  "transition-colors focus-ring-inset hover:bg-surface-subtle active:bg-surface-subtle",
].join(" ");

/** Said in place of the form while the workflows you can start can't be read (states audit gap 5). */
export const OFFERED_FAILED = "Couldn't load the workflows you can start.";

/** What the Inbox page needs from the request form, or nothing when there is none to offer. */
export interface RequestPane {
  /** **New request**, for the list's header; `null` with no form. */
  readonly newRequest: ReactNode;
  /** The form for the right pane while no card is open; `null` with no form. */
  readonly form: ReactNode;
  /** The phone's request sheet while it is open; `null` otherwise and on a desktop. */
  readonly sheet: ReactNode;
}

/**
 * The request form's pieces for the Inbox page: the form, **New request** and the text you have
 * typed, which stays here while a card is open. A phone has no pane for the form: **New request**
 * is a row above its list and opens the request sheet (first-run 7.2).
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
  /** Kept true while a phone's request sheet is open, so the card that arrives counts it as the form. */
  readonly sheetOpen?: MutableRefObject<boolean> | undefined;
  /** A card is open: a phone's request sheet closes, since the card it waited for has arrived. */
  readonly cardOpen?: boolean | undefined;
}): RequestPane {
  const {
    inbox,
    requests,
    phone,
    list,
    closeItem,
    words,
    openRun,
    onStarted,
    sheetOpen: shared,
    cardOpen,
  } = options;
  const { list: offered, failed, retry } = useOffered(requests);
  const [draft, setDraft] = useState(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [notStarted, setNotStarted] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const toasts = useToastStore();
  const message = useRef<HTMLTextAreaElement>(null);
  const formAsked = useRef(false);
  const [asks, setAsks] = useState(0);
  if (shared !== undefined) shared.current = phone && sheetOpen;
  useEffect(() => {
    if (cardOpen) setSheetOpen(false);
  }, [cardOpen]);
  const closeLatest = useRef(closeItem);
  closeLatest.current = closeItem;
  useEffect(() => {
    const take = () => {
      if (!inbox.takeNewRequest()) return;
      formAsked.current = true;
      closeLatest.current();
      setSheetOpen(true);
      setAsks((count) => count + 1);
    };
    take();
    return inbox.subscribe(take);
  }, [inbox]);
  // Focus goes to Message once the form is in the pane, which may be after the offered list loads.
  // Without requests there will be no form, so an ask doesn't wait for one.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `asks` and `offered` say the form may have appeared.
  useEffect(() => {
    if (requests === undefined) formAsked.current = false;
    if (formAsked.current && message.current !== null) {
      message.current.focus();
      formAsked.current = false;
    }
  }, [asks, offered.length, requests, sheetOpen]);
  if (requests !== undefined && failed) {
    // Said where the form would be, so a failed read doesn't look like a workspace with none.
    const line = <QuietLine line={OFFERED_FAILED} retry={retry} />;
    return { newRequest: phone ? line : null, form: phone ? null : line, sheet: null };
  }
  if (requests === undefined || offered.length === 0) {
    return { newRequest: null, form: null, sheet: null };
  }
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
        title: `${workflow.name} started`,
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
    if (phone) {
      formAsked.current = true;
      setSheetOpen(true);
      return;
    }
    // The form is in the pane once the card has closed, so Message can take focus.
    flushSync(closeItem);
    message.current?.focus();
  };
  const onEscape = () => list.current?.querySelector<HTMLElement>('[role="gridcell"]')?.focus();
  return {
    newRequest: phone ? (
      <button type="button" className={newRequestRowClasses} onClick={showForm}>
        <span className="size-icon-md shrink-0 *:size-full" aria-hidden="true">
          <PlusIcon />
        </span>
        New request
      </button>
    ) : (
      <Button variant="secondary" size="sm" icon={<PlusIcon />} onClick={showForm}>
        New request
      </Button>
    ),
    form: phone ? null : (
      <RequestForm
        offered={offered}
        draft={draft}
        onDraft={setDraft}
        busy={busy}
        notStarted={notStarted}
        onSend={send}
        onEscape={onEscape}
        messageRef={message}
      />
    ),
    sheet:
      phone && sheetOpen ? (
        <RequestSheet
          offered={offered}
          draft={draft}
          onDraft={setDraft}
          busy={busy}
          notStarted={notStarted}
          onSend={send}
          onClose={() => setSheetOpen(false)}
          messageRef={message}
        />
      ) : null,
  };
}
