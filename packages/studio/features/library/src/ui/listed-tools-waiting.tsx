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
  /** Opens the workspace's trust check; without it, a workspace that isn't trusted gets no button. */
  readonly onReviewTrust?: () => void;
  /** On a phone the line shows, but approving is for the desktop: no button, a view-only line. */
  readonly viewOnly?: boolean;
}

/** The line for a screen the dialog alone can show, or `undefined` for one the page stays quiet on. */
function noticeOf(fallback: ReviewFallback): string | undefined {
  if (fallback.kind === "listing-refused") return listedToolsWords.waitingNotice.listingRefused;
  if (fallback.kind === "unreadable") return listedToolsWords.waitingNotice.unreadable;
  return undefined;
}

/**
 * The button of the "Couldn't list the tools" line: **Review**, the trust check, when the
 * workspace isn't trusted (none when the page can't open it), else **Try again**.
 */
function LoadFailedButton({
  needsTrust,
  onTryAgain,
  onReviewTrust,
}: {
  readonly needsTrust: boolean;
  readonly onTryAgain: () => void;
  readonly onReviewTrust?: () => void;
}) {
  if (!needsTrust) {
    return (
      <Button variant="secondary" onClick={onTryAgain}>
        {listedToolsWords.tryAgain}
      </Button>
    );
  }
  if (onReviewTrust === undefined) return null;
  return (
    <Button variant="secondary" onClick={onReviewTrust}>
      {listedToolsWords.reviewTrust}
    </Button>
  );
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
 * which opens the review dialog; where the page is view only, the button gives way to a line that
 * says so. It shows nothing while the tools are being read and when none
 * waits. When the list couldn't be read, was refused, or an approval is unreadable, it says so in
 * one line with **Try again** or **Review tools**, since the dialog's screens for those can't
 * be reached otherwise. When the workspace isn't trusted, trying again can't help, so the line
 * offers **Review**, which opens the trust check, instead. The dialog shares this model, so an
 * approval updates the line behind it.
 */
export function ListedToolsWaiting({
  model,
  sourceName,
  onReviewTrust,
  viewOnly = false,
}: ListedToolsWaitingProps) {
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
      {waiting === 0 && fallback?.kind === "load-failed" ? (
        <WaitingLine text={listedToolsWords.loadFailed(fallback.reason)}>
          <LoadFailedButton
            needsTrust={fallback.needsTrust}
            onTryAgain={() => void model.refresh()}
            {...(onReviewTrust === undefined ? {} : { onReviewTrust })}
          />
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
