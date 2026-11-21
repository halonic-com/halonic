import { Button, useToastStore } from "@halonicjs/studio-kit";
import { type EngineWords, engineWords } from "@halonicjs/studio-shell";
import { type ReactNode, useCallback, useState, useSyncExternalStore } from "react";
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
  /** Opens the workspace's trust check; without it, a workspace that isn't trusted gets no button. */
  readonly onReviewTrust?: () => void;
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

/** One line of text with its button at the right, wrapping under it on a narrow page. */
function WaitingLine({
  text,
  children,
}: {
  readonly text: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
      <p className="min-w-0 text-body [overflow-wrap:anywhere]">{text}</p>
      {children}
    </div>
  );
}

/** The "Couldn't list the tools" line with its buttons, and a command to run under it. */
function LoadFailed({
  line,
  ...handlers
}: LoadFailedHandlers & { readonly line: LoadFailureLine }) {
  const actions = useLoadFailedActions(line, handlers);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <WaitingLine text={<LoadFailedText line={line} />}>
        {actions.map((action) => (
          <Button key={action.label} variant="secondary" onClick={() => void action.onClick()}>
            {action.label}
          </Button>
        ))}
      </WaitingLine>
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
 * offers **Review**, which opens the trust check, instead. When the agent host says why the
 * program couldn't list its tools, the line says it too (`loadFailureLine`). The dialog shares
 * this model, so an approval updates the line behind it.
 */
export function ListedToolsWaiting({
  model,
  sourceName,
  onReviewTrust,
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
        <LoadFailed
          line={loadFailureLine(fallback.error, sourceName, engine, secretsOnPage)}
          error={fallback.error}
          onTryAgain={() => void model.refresh()}
          onReviewTrust={onReviewTrust}
        />
      ) : null}
      {waiting === 0 && fallback !== null && noticeOf(fallback) !== undefined ? (
        <WaitingLine text={noticeOf(fallback) ?? ""}>
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
