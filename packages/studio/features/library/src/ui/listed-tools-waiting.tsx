import { Button, CommandBox, useToastStore } from "@halonicjs/studio-kit";
import { type EngineWords, engineWords } from "@halonicjs/studio-shell";
import {
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { type LoadFailureLine, loadFailureLine } from "../listed-tools-load-failure.ts";
import type { ListedToolsReviewModel } from "../listed-tools-review-model.ts";
import { listedToolsWords } from "../listed-tools-words.ts";
import { type ReviewFallback, reviewFallback } from "./listed-tools-fallbacks.tsx";
import {
  type LoadFailedHandlers,
  LoadFailedText,
  useLoadFailedActions,
} from "./listed-tools-load-failed.tsx";
import { ListedToolsReviewDialog } from "./listed-tools-review-dialog.tsx";

/** Props for {@link ListedToolsWaiting}. */
export interface ListedToolsWaitingProps {
  readonly model: ListedToolsReviewModel;
  /** The connector's name, as on its card: the dialog's title while its tools are being read. */
  readonly sourceName: string;
  /**
   * Opens the workspace's trust check over the page and says how the person answered; without
   * it, a workspace that isn't trusted gets no button.
   */
  readonly askTrust?: (() => Promise<"trusted" | "declined">) | undefined;
  /** On a phone the line shows, but approving is for the desktop: no button, a view-only line. */
  readonly viewOnly?: boolean;
  /** The words for an engine that isn't answering, for where Studio runs; the desktop app's by default. */
  readonly engine?: EngineWords;
  /** The connector's page has a Secrets section, so a secret's line says to set it there. */
  readonly secretsOnPage?: boolean;
}

/** The line for a screen the dialog alone can show, or `undefined` for one the page stays quiet on. */
function noticeOf(fallback: ReviewFallback): string | undefined {
  if (fallback.kind === "listing-refused") return listedToolsWords.waitingNotice.listingRefused;
  if (fallback.kind === "unreadable") return listedToolsWords.waitingNotice.unreadable;
  return undefined;
}

/**
 * One line of text with its button at the right, wrapping under it on a narrow page. Its text can
 * take focus (`tabIndex=-1`), so a **Try again** that this line replaces hands focus to it.
 */
function WaitingLine({
  text,
  textRef,
  children,
}: {
  readonly text: ReactNode;
  readonly textRef: Ref<HTMLParagraphElement>;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
      <p
        ref={textRef}
        tabIndex={-1}
        className="min-w-0 rounded-sm text-body [overflow-wrap:anywhere] focus-visible:focus-ring"
      >
        {text}
      </p>
      {children}
    </div>
  );
}

/**
 * The "Couldn't list the tools" line with its buttons. While its **Try again** lists the tools,
 * the button stays where it is, busy. When the line gives a command to run, its sentence ends in a
 * colon, so the command comes straight under it and the buttons follow in their own row: on screen
 * and for Tab, **Copy command** comes before **Try again** (C652 #3). Without a command the buttons
 * sit beside the sentence.
 */
function LoadFailed({
  line,
  textRef,
  retrying,
  ...handlers
}: LoadFailedHandlers & {
  readonly line: LoadFailureLine;
  readonly textRef: Ref<HTMLParagraphElement>;
  readonly retrying: boolean;
}) {
  const actions = useLoadFailedActions(line, handlers);
  const buttons = actions.map((action) => (
    <Button
      key={action.label}
      variant="secondary"
      busy={retrying && action.label === listedToolsWords.tryAgain}
      onClick={() => void action.onClick()}
    >
      {action.label}
    </Button>
  ));
  const text = <LoadFailedText line={line} />;
  if (line.command === undefined) {
    return (
      <WaitingLine text={text} textRef={textRef}>
        {buttons}
      </WaitingLine>
    );
  }
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <WaitingLine text={text} textRef={textRef}>
        {null}
      </WaitingLine>
      <CommandBox command={line.command} />
      <div className="flex flex-wrap gap-2">{buttons}</div>
    </div>
  );
}

/** The failed reading a **Try again** started from, kept on screen until the new one answers. */
type LoadFailedFallback = Extract<ReviewFallback, { readonly kind: "load-failed" }>;

/**
 * **Try again** for the "Couldn't list the tools" line, as on the run page (C533-1): while the
 * tools are listed again the line and its busy button stay, and then focus goes to the line that
 * replaced it ("N tools are off until you review them", or the new failure), so it's read out and
 * Tab goes on to its button (C551 S2). `lineRef` goes on whichever line shows.
 */
function useTryAgain(model: ListedToolsReviewModel) {
  const [retrying, setRetrying] = useState<LoadFailedFallback | null>(null);
  const lineRef = useRef<HTMLParagraphElement>(null);
  const focusLine = useRef(false);

  useEffect(() => {
    if (!focusLine.current || retrying !== null) return;
    focusLine.current = false;
    lineRef.current?.focus();
  }, [retrying]);

  const tryAgain = (failed: LoadFailedFallback) => {
    setRetrying(failed);
    void model.refresh().finally(() => {
      focusLine.current = true;
      setRetrying(null);
    });
  };
  return { retrying, tryAgain, lineRef };
}

/**
 * The connector's "N tools are off until you review them" line with its **Review tools** button,
 * which opens the review dialog; where the page is view only, the button gives way to a line that
 * says so. It shows nothing while the tools are being read and when none
 * waits. When the list couldn't be read, was refused, or an approval is unreadable, it says so in
 * one line with **Try again** or **Review tools**, since the dialog's screens for those can't
 * be reached otherwise. When the workspace isn't trusted, trying again can't help, so the line
 * offers **Review**, which opens the trust check over the page, instead; once the person trusts
 * the workspace there, the tools are listed again as for **Try again**. When the agent host says why the
 * program couldn't list its tools, the line says it too (`loadFailureLine`). **Try again** stays,
 * busy, while it lists, then hands focus to the line that replaced it (`useTryAgain`). The dialog
 * shares this model, so an approval updates the line behind it.
 */
export function ListedToolsWaiting({
  model,
  sourceName,
  askTrust,
  viewOnly = false,
  engine = engineWords["desktop-app"],
  secretsOnPage = false,
}: ListedToolsWaitingProps) {
  const subscribe = useCallback((listener: () => void) => model.subscribe(listener), [model]);
  const state = useSyncExternalStore(subscribe, () => model.state);
  const { snapshot } = state;
  const fallback = reviewFallback(state);
  const toasts = useToastStore();
  const [open, setOpen] = useState(false);
  const { retrying, tryAgain, lineRef } = useTryAgain(model);
  const waiting =
    snapshot === undefined ? 0 : snapshot.toReview.length + snapshot.keepsChanging.length;
  // While its Try again runs, the failure it started from stays, so the button keeps its place.
  const failed = retrying ?? (fallback?.kind === "load-failed" ? fallback : null);

  // Trusting the workspace from **Review** lists the tools again at once, as **Try again** does,
  // so focus comes back from the trust check to the line that replaces this one (C605 #5).
  const reviewTrust = async (
    ask: () => Promise<"trusted" | "declined">,
    from: LoadFailedFallback,
  ) => {
    if ((await ask()) === "trusted") tryAgain(from);
  };
  const close = (toast: string | null) => {
    setOpen(false);
    if (toast !== null) toasts?.show({ tone: "success", title: toast });
  };
  return (
    <>
      {waiting > 0 ? (
        <WaitingLine text={listedToolsWords.waitingBadge(waiting)} textRef={lineRef}>
          {viewOnly ? (
            <p className="min-w-0 text-small text-fg-muted [overflow-wrap:anywhere]">
              {listedToolsWords.reviewToolsViewOnly}
            </p>
          ) : (
            <Button variant="secondary" onClick={() => setOpen(true)}>
              {listedToolsWords.reviewTools}
            </Button>
          )}
        </WaitingLine>
      ) : null}
      {waiting === 0 && failed !== null ? (
        <LoadFailed
          line={loadFailureLine(failed.error, sourceName, engine, secretsOnPage)}
          textRef={lineRef}
          retrying={retrying !== null}
          error={failed.error}
          onTryAgain={() => tryAgain(failed)}
          onReviewTrust={
            askTrust === undefined ? undefined : () => void reviewTrust(askTrust, failed)
          }
        />
      ) : null}
      {waiting === 0 && fallback !== null && noticeOf(fallback) !== undefined ? (
        <WaitingLine text={noticeOf(fallback) ?? ""} textRef={lineRef}>
          <Button variant="secondary" onClick={() => setOpen(true)}>
            {listedToolsWords.reviewTools}
          </Button>
        </WaitingLine>
      ) : null}
      {open ? (
        <ListedToolsReviewDialog
          model={model}
          sourceName={sourceName}
          engine={engine}
          secretsOnPage={secretsOnPage}
          onClose={close}
        />
      ) : null}
    </>
  );
}
