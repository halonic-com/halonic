import { Button, useToastStore } from "@halonicjs/studio-kit";
import { useId } from "react";
import type { ChangesList } from "../changes-list.ts";
import { mergeWords, updatesWords } from "../changes-words.ts";

/**
 * Get updates (checklist part 2, 2.8): brings in the shared copy's newer versions when this
 * workspace has none the shared copy lacks. The result is a toast; a failure's has Try again,
 * except when both sides have new versions, which trying again can't change.
 */
export function GetUpdates({
  list,
  phone = false,
}: {
  readonly list: ChangesList;
  /** On a phone the button is a 48px touch button. */
  readonly phone?: boolean;
}) {
  const toasts = useToastStore();
  const reasonId = useId();
  const getUpdates = async (): Promise<void> => {
    const outcome = await list.getUpdates();
    if (outcome.kind === "got") {
      toasts?.show({ tone: "success", title: updatesWords.got(outcome.count) });
    } else if (outcome.kind === "choosing") {
      // The choices open on the page; nothing to say here.
    } else if (outcome.kind === "up-to-date") {
      toasts?.show({ tone: "success", title: updatesWords.upToDate });
    } else {
      const bothMoved = outcome.kind === "both-moved";
      toasts?.show({
        tone: "danger",
        title: updatesWords.failed,
        text: `${bothMoved ? updatesWords.bothMoved : outcome.reason} ${updatesWords.nothingChanged}`,
        ...(bothMoved
          ? {}
          : { action: { label: updatesWords.tryAgain, onClick: () => void getUpdates() } }),
      });
    }
  };
  const merging = list.merging;
  return (
    <>
      <Button
        variant="secondary"
        size={phone ? "touch" : "sm"}
        busy={list.state.gettingUpdates}
        busyLabel={updatesWords.gettingUpdates}
        unavailable={merging ? { reason: reasonId } : undefined}
        onClick={() => void getUpdates()}
      >
        {updatesWords.getUpdates}
      </Button>
      {merging ? (
        <span id={reasonId} className="text-small text-fg-muted">
          {mergeWords.finishFirst}
        </span>
      ) : null}
    </>
  );
}
