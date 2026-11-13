import { Callout, Dialog, type DialogCancelReason } from "@halonicjs/studio-kit";
import { useCallback, useRef, useSyncExternalStore } from "react";
import {
  type ListedToolsReviewModel,
  listedToolCount,
  type ReviewOutcome,
} from "../listed-tools-review-model.ts";
import { listedToolsWords } from "../listed-tools-words.ts";
import { ListedToolsReviewBody } from "./listed-tools-review-body.tsx";
import { ListedToolsSearch } from "./listed-tools-search.tsx";

/** Props for {@link ListedToolsReviewDialog}. */
export interface ListedToolsReviewDialogProps {
  readonly model: ListedToolsReviewModel;
  /**
   * The review is over. `toast` is what to say once the dialog is gone (toasts don't show over a
   * dialog), or `null` for nothing: Esc, the ✕ and the overlay close without one (N7).
   */
  readonly onClose: (toast: string | null) => void;
}

/**
 * One connector's review of its listed tools, in the kit's Dialog: **Approve none**, **Approve
 * all** and **Approve selected**. Only **Approve none** says anything when it closes the
 * dialog; Esc and the ✕ leave quietly. It shows nothing until the tools are read: the loading and
 * failure states come with the fallbacks.
 */
export function ListedToolsReviewDialog({ model, onClose }: ListedToolsReviewDialogProps) {
  const subscribe = useCallback((listener: () => void) => model.subscribe(listener), [model]);
  const state = useSyncExternalStore(subscribe, () => model.state);
  const removedToast = useRef<string | null>(null);
  const { snapshot } = state;
  if (snapshot === undefined) return null;

  const close = (outcome: ReviewOutcome) => {
    if (outcome.kind === "close") onClose(outcome.toast ?? removedToast.current);
  };
  const cancel = (reason: DialogCancelReason) =>
    reason === "button" ? close(model.approveNone()) : onClose(removedToast.current);
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
      <ListedToolsReviewBody
        model={model}
        onRemoved={(toast) => {
          removedToast.current = toast;
        }}
      />
    </Dialog>
  );
}
