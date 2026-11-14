import { Button, useToastStore } from "@halonicjs/studio-kit";
import { useCallback, useState, useSyncExternalStore } from "react";
import type { ListedToolsReviewModel } from "../listed-tools-review-model.ts";
import { listedToolsWords } from "../listed-tools-words.ts";
import { ListedToolsReviewDialog } from "./listed-tools-review-dialog.tsx";

/** Props for {@link ListedToolsWaiting}. */
export interface ListedToolsWaitingProps {
  readonly model: ListedToolsReviewModel;
  /** The connector's name, as on its card: the dialog's title while its tools are being read. */
  readonly sourceName: string;
}

/**
 * The connector's "N tools are waiting for your approval" line with its **Review tools** button,
 * which opens the review dialog. It shows nothing while the tools are being read, when they
 * couldn't be read, and when none waits: the dialog's own screens say why for the person who asks.
 * The dialog shares this model, so an approval updates the line behind it.
 */
export function ListedToolsWaiting({ model, sourceName }: ListedToolsWaitingProps) {
  const subscribe = useCallback((listener: () => void) => model.subscribe(listener), [model]);
  const { snapshot } = useSyncExternalStore(subscribe, () => model.state);
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
      {waiting === 0 ? null : (
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          <p className="min-w-0 text-body [overflow-wrap:anywhere]">
            {listedToolsWords.waitingBadge(waiting)}
          </p>
          <Button variant="secondary" onClick={() => setOpen(true)}>
            {listedToolsWords.reviewTools}
          </Button>
        </div>
      )}
      {open ? (
        <ListedToolsReviewDialog model={model} sourceName={sourceName} onClose={close} />
      ) : null}
    </>
  );
}
