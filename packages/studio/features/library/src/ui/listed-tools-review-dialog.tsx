import { Callout, Dialog, type DialogCancelReason } from "@halonicjs/studio-kit";
import { useCallback, useRef, useSyncExternalStore } from "react";
import {
  type ListedToolsReviewModel,
  listedToolCount,
  type ReviewOutcome,
} from "../listed-tools-review-model.ts";
import { listedToolsWords } from "../listed-tools-words.ts";
import { ListedToolsFallbackBody, reviewFallback } from "./listed-tools-fallbacks.tsx";
import { ListedToolsReviewBody } from "./listed-tools-review-body.tsx";
import { ListedToolsSearch } from "./listed-tools-search.tsx";

/** Props for {@link ListedToolsReviewDialog}. */
export interface ListedToolsReviewDialogProps {
  readonly model: ListedToolsReviewModel;
  /** The connector's name, as on its card: the title while the tools are still being read. */
  readonly sourceName: string;
  /**
   * The review is over. `toast` is what to say once the dialog is gone (toasts don't show over a
   * dialog), or `null` for nothing: Esc, the ✕ and the overlay close without one (N7).
   */
  readonly onClose: (toast: string | null) => void;
}

/**
 * One connector's review of its listed tools, in the kit's Dialog: **Approve none**, **Approve
 * all** and **Approve selected**. Only **Approve none** says anything when it closes the
 * dialog; Esc and the ✕ leave quietly. A screen with no rows to decide on (loading, a failed or
 * refused listing, an unreadable approval, nothing waiting) has no buttons, only the ✕.
 */
export function ListedToolsReviewDialog({
  model,
  sourceName,
  onClose,
}: ListedToolsReviewDialogProps) {
  const subscribe = useCallback((listener: () => void) => model.subscribe(listener), [model]);
  const state = useSyncExternalStore(subscribe, () => model.state);
  const removedToast = useRef<string | null>(null);
  // A browser-forced close while an approval runs reports once now and once when it resolves.
  const closed = useRef(false);
  const { snapshot } = state;

  const finish = (toast: string | null) => {
    if (closed.current) return;
    closed.current = true;
    onClose(toast);
  };
  const rememberRemoved = (toast: string) => {
    removedToast.current = toast;
  };
  const close = (outcome: ReviewOutcome) => {
    if (outcome.kind === "close") finish(outcome.toast ?? removedToast.current);
  };
  const cancel = (reason: DialogCancelReason) =>
    reason === "button" ? close(model.approveNone()) : finish(removedToast.current);
  const fallback = reviewFallback(state);
  if (fallback !== null) {
    return (
      <Dialog
        title={listedToolsWords.title(snapshot?.sourceName ?? sourceName)}
        size="md"
        onCancel={() => finish(removedToast.current)}
      >
        <p>{listedToolsWords.topLine}</p>
        <ListedToolsFallbackBody
          fallback={fallback}
          sourceName={snapshot?.sourceName ?? sourceName}
          onTryAgain={() => model.refresh()}
          onRemoveApproval={async (toolName) => {
            removedToast.current = (await model.removeApproval(toolName)) ?? removedToast.current;
          }}
        />
        {fallback.kind === "nothing-waiting" ? (
          <ListedToolsReviewBody model={model} onRemoved={rememberRemoved} onOutcome={close} />
        ) : null}
      </Dialog>
    );
  }
  if (snapshot === undefined) return null;
  const shown = model.shown;
  const shownCount = shown.toReview.length + shown.keepsChanging.length + shown.refused.length;
  const searching = state.search.trim() !== "";
  return (
    <Dialog
      title={listedToolsWords.title(snapshot.sourceName)}
      size="md"
      confirm={{
        label: listedToolsWords.approveSelected,
        busyLabel: listedToolsWords.approving,
      }}
      alternative={{
        label: searching
          ? listedToolsWords.approveAllShown(shown.toReview.length)
          : listedToolsWords.approveAll,
        onClick: () => void model.approveAll().then(close),
      }}
      cancelLabel={listedToolsWords.approveNone}
      busy={state.busy}
      {...(state.approveError === undefined ? {} : { error: state.approveError })}
      footnote={listedToolsWords.allRule}
      onConfirm={() => void model.approveSelected().then(close)}
      onCancel={cancel}
    >
      <p>{listedToolsWords.topLine}</p>
      {state.changedAgain.map((name) => (
        <Callout key={name} tone="warning">
          {listedToolsWords.changedAgain(name)}
        </Callout>
      ))}
      {listedToolCount(snapshot) <= listedToolsWords.searchThreshold ? null : (
        <ListedToolsSearch
          sourceName={snapshot.sourceName}
          search={state.search}
          shownCount={shownCount}
          onSearch={(search) => model.setSearch(search)}
        />
      )}
      <ListedToolsReviewBody model={model} onRemoved={rememberRemoved} onOutcome={close} />
    </Dialog>
  );
}
