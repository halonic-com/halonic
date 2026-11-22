import { Dialog } from "@halonicjs/studio-kit";
import { useState } from "react";
import { computersWords } from "./computers-words.ts";
import type { ForgetOutcome, ListedComputer, UnreadableComputer } from "./phone-tunnel.ts";

export const isUnreadable = (computer: ListedComputer): computer is UnreadableComputer =>
  computer.standing === "unreadable";

/**
 * What Forget asks and says when it fails, for a computer with or without a name. A computer
 * that removed this phone no longer lists it, so its question doesn't say it does (C666); one
 * that can't confirm who it is may or may not (C665-5).
 */
function forgetWords(computer: ListedComputer) {
  if (isUnreadable(computer)) return computersWords.unreadable.forget;
  return {
    title: computersWords.forget.title(computer.name),
    body: computersWords.forget.body,
    stillPaired: stillPairedLine(computer.standing, computer.name),
    failed: computersWords.forget.failed(computer.name),
    keysUnavailable: computersWords.forget.keysUnavailable(computer.name),
  };
}

function stillPairedLine(standing: "paired" | "removed" | "cant-confirm", name: string) {
  if (standing === "removed") return undefined;
  if (standing === "cant-confirm") return computersWords.forget.maybePaired(name);
  return computersWords.forget.stillPaired;
}

/** What the phone says politely once a computer is forgotten (microcopy 28). */
export const forgottenWords = (computer: ListedComputer) =>
  isUnreadable(computer)
    ? computersWords.unreadable.forgotten
    : computersWords.forgotten(computer.name);

/**
 * `d-m2`: Forget asks once, says the computer still lists this phone unless it removed it, and
 * changes nothing on Cancel. A Forget that fails keeps the question open with the reason. Used by the Paired
 * computers list and by Removed and Can't confirm (`s-m7`, `s-m9`).
 */
export function ForgetDialog({
  computer,
  onForget,
  onForgotten,
  onCancel,
  returnFocus,
}: {
  readonly computer: ListedComputer;
  /** Deletes the entry (`PhoneTunnel.forget`). */
  readonly onForget: (computer: ListedComputer) => Promise<ForgetOutcome>;
  /** The entry is gone: the page unmounts the question. */
  readonly onForgotten: () => void;
  readonly onCancel: () => void;
  /** Where focus goes when the question closes and its opener has gone. */
  readonly returnFocus?: (() => HTMLElement | null) | undefined;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const asking = forgetWords(computer);

  const confirm = async () => {
    setBusy(true);
    setError(undefined);
    let outcome: ForgetOutcome | undefined;
    try {
      outcome = await onForget(computer);
    } catch {
      // The line below says so.
    }
    setBusy(false);
    if (outcome?.kind === "forgotten") {
      onForgotten();
      return;
    }
    setError(outcome === undefined ? asking.failed : asking.keysUnavailable);
  };

  return (
    <Dialog
      size="sm"
      title={asking.title}
      confirm={{
        label: computersWords.forget.confirm,
        variant: "danger",
        busyLabel: computersWords.forget.busy,
      }}
      cancelLabel={computersWords.forget.cancel}
      busy={busy}
      {...(error === undefined ? {} : { error })}
      {...(returnFocus === undefined ? {} : { returnFocus })}
      onConfirm={() => void confirm()}
      onCancel={onCancel}
    >
      <p className="text-fg">{asking.body}</p>
      {asking.stillPaired === undefined ? null : (
        <p className="mt-2 text-fg-muted">{asking.stillPaired}</p>
      )}
    </Dialog>
  );
}
