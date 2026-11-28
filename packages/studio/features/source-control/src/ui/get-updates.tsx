import { Button, useOpenExternal, useToastStore } from "@halonicjs/studio-kit";
import { useId } from "react";
import type { ChangesList } from "../changes-list.ts";
import { mergeWords, updatesWords } from "../changes-words.ts";

/**
 * Get updates (checklist part 2, 2.8): brings in the shared copy's newer versions when this
 * workspace has none the shared copy lacks. The result is a toast; a failure's has Try again.
 * When both sides have new versions the choices open instead, so "both-moved" only comes back
 * when one side moved during the get, and trying again can help (HAL-12642). A refusal another
 * step must clear has no Try again, which would be refused the same way: over a file Halonic
 * leaves to git it has Show how, which opens the how-to and leaves the toast standing; over
 * changes not in a version it has no action, since its words say what to do (HAL-16534).
 */
export function GetUpdates({
  list,
  phone = false,
  onLeftToGit,
}: {
  readonly list: ChangesList;
  /** On a phone the button is a 48px touch button. */
  readonly phone?: boolean;
  /**
   * Told `true` when Get updates is refused over a file Halonic leaves to git, so the page shows
   * the git steps, and `false` when it's pressed again.
   */
  readonly onLeftToGit?: (refused: boolean) => void;
}) {
  const toasts = useToastStore();
  const openExternal = useOpenExternal();
  const reasonId = useId();
  // A refusal has no Try again: over a file left to git it has Show how, otherwise no action.
  const failureAction = (refusal: { readonly leftToGit: boolean } | undefined) => {
    if (refusal === undefined) {
      return { action: { label: updatesWords.tryAgain, onClick: () => void getUpdates() } };
    }
    if (!refusal.leftToGit) return {};
    return {
      action: {
        label: updatesWords.showHow,
        onClick: () => void openExternal(updatesWords.leftToGitHowTo),
        keepOpen: true,
      },
    };
  };
  const getUpdates = async (): Promise<void> => {
    onLeftToGit?.(false);
    const outcome = await list.getUpdates();
    if (outcome.kind === "refused") onLeftToGit?.(true);
    if (outcome.kind === "got") {
      toasts?.show({ tone: "success", title: updatesWords.got(outcome.count, outcome.people) });
    } else if (outcome.kind === "choosing") {
      // The choices open on the page; nothing to say here.
    } else if (outcome.kind === "up-to-date") {
      toasts?.show({ tone: "success", title: updatesWords.upToDate });
    } else {
      const reason = outcome.kind === "both-moved" ? updatesWords.bothMoved : outcome.reason;
      toasts?.show({
        tone: "danger",
        title: updatesWords.failed,
        text: `${reason} ${updatesWords.nothingChanged}`,
        ...failureAction(outcome.kind === "refused" ? outcome : undefined),
      });
    }
  };
  const merging = list.merging;
  const button = (
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
  );
  const reason = (className: string) =>
    merging ? (
      <span id={reasonId} className={`text-small text-fg-muted ${className}`}>
        {mergeWords.finishFirst}
      </span>
    ) : null;
  // On a phone the reason sits on its own line under the button, lined up with its left edge.
  if (phone) {
    return (
      <span className="ml-auto flex flex-col items-start gap-1">
        {button}
        {reason("")}
      </span>
    );
  }
  // On the desktop the button ends the header's line and the reason takes a line of its own under
  // it, the column's whole width, rather than wrapping beside it.
  return (
    <>
      <span className="ml-auto">{button}</span>
      {reason("basis-full")}
    </>
  );
}
