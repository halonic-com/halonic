import { Button, useToastStore } from "@halonicjs/studio-kit";
import { type ReactNode, useCallback, useState, useSyncExternalStore } from "react";
import type { ListedToolsReviewModel } from "../listed-tools-review-model.ts";
import { listedToolsWords } from "../listed-tools-words.ts";
import { type ReviewFallback, reviewFallback } from "./listed-tools-fallbacks.tsx";
import { ListedToolsReviewDialog } from "./listed-tools-review-dialog.tsx";

/** Props for {@link ListedToolsWaiting}. */
export interface ListedToolsWaitingProps {
  readonly model: ListedToolsReviewModel;
  /** The connector's name, as on its card: the dialog's title while its tools are being read. */
  readonly sourceName: string;
}

/** The line for a screen the dialog alone can show, or `undefined` for one the page stays quiet on. */
function noticeOf(fallback: ReviewFallback): string | undefined {
  if (fallback.kind === "listing-refused") return listedToolsWords.waitingNotice.listingRefused;
  if (fallback.kind === "unreadable") return listedToolsWords.waitingNotice.unreadable;
  return undefined;
}

/** One line of text with its button at the right, wrapping under it on a narrow page. */
function WaitingLine({ text, children }: { readonly text: string; readonly children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
      <p className="min-w-0 text-body [overflow-wrap:anywhere]">{text}</p>
      {children}
    </div>
  );
}

/**
 * The connector's "N tools are waiting for your approval" line with its **Review tools** button,
 * which opens the review dialog. It shows nothing while the tools are being read and when none
 * waits. When the list couldn't be read, was refused, or an approval is unreadable, it says so in
 * one line with **Try again** or **Review tools**, since the dialog's screens for those can't
 * be reached otherwise. The dialog shares this model, so an approval updates the line behind it.
 */
export function ListedToolsWaiting({ model, sourceName }: ListedToolsWaitingProps) {
  const subscribe = useCallback((listener: () => void) => model.subscribe(listener), [model]);
  const state = useSyncExternalStore(subscribe, () => model.state);
  const { snapshot } = state;
  const fallback = reviewFallback(state);
  const toasts = useToastStore();
  const [open, setOpen] = useState(false);
  const waiting =
    snapshot === undefined ? 0 : snapshot.toReview.length + snapshot.keepsChanging.length;

  const close = (toast: string | null) => {
    setOpen(false);
    if (toast !== null) toasts?.show({ tone: "success", title: toast });
  };
  return (
    <>
      {waiting > 0 ? (
        <WaitingLine text={listedToolsWords.waitingBadge(waiting)}>
          <Button variant="secondary" onClick={() => setOpen(true)}>
            {listedToolsWords.reviewTools}
          </Button>
        </WaitingLine>
      ) : null}
      {waiting === 0 && fallback?.kind === "load-failed" ? (
        <WaitingLine text={listedToolsWords.loadFailed(fallback.reason)}>
          <Button variant="secondary" onClick={() => void model.refresh()}>
            {listedToolsWords.tryAgain}
          </Button>
        </WaitingLine>
      ) : null}
      {waiting === 0 && fallback !== null && noticeOf(fallback) !== undefined ? (
        <WaitingLine text={noticeOf(fallback) ?? ""}>
          <Button variant="secondary" onClick={() => setOpen(true)}>
            {listedToolsWords.reviewTools}
          </Button>
        </WaitingLine>
      ) : null}
      {open ? (
        <ListedToolsReviewDialog model={model} sourceName={sourceName} onClose={close} />
      ) : null}
    </>
  );
}
