import { Button, LockIcon, ShieldIcon } from "@halonicjs/studio-kit";
import { useState } from "react";
import { ForgetDialog } from "./forget-dialog.tsx";
import type { ForgetOutcome, ListedComputer, PairedComputer } from "./phone-tunnel.ts";
import { standingWords } from "./status-words.ts";

/** The two states that hold until the person acts, so they get a screen instead of a sheet. */
export type Standing = "removed" | "cantConfirm";

/**
 * Removed (`s-m7`) and Can't confirm (`s-m9`), in place of the agents: the red tile, what
 * happened, Pair again and Forget this computer, which asks once (`d-m2`). Removed comes only
 * after the computer proved who it is; the shell has then cleared its key, and the page clears
 * what it held from that computer. Can't confirm clears nothing and says so. The header's live
 * region has already said the state, so focus isn't moved here.
 */
export function StandingScreen({
  standing,
  computer,
  onPairAgain,
  onForget,
  onForgotten,
}: {
  readonly standing: Standing;
  readonly computer: PairedComputer;
  readonly onPairAgain: () => void;
  /** Deletes the entry (`PhoneTunnel.forget`). */
  readonly onForget: (computer: ListedComputer) => Promise<ForgetOutcome>;
  /** The entry is gone: the page leaves this screen and says so. */
  readonly onForgotten: () => void;
}) {
  const [asking, setAsking] = useState(false);
  const removed = standing === "removed";
  const words = removed ? standingWords.removed : standingWords.cantConfirm;
  return (
    <div className="grid min-h-full place-items-center px-6 py-8">
      <div className="flex max-w-empty flex-col items-center gap-3 text-center">
        <span
          aria-hidden="true"
          className="mb-1 inline-grid size-14 place-items-center rounded-lg bg-danger-soft text-danger"
        >
          <span className="inline-grid size-icon-md place-items-center *:size-full">
            {removed ? <LockIcon /> : <ShieldIcon />}
          </span>
        </span>
        <h2 className="text-title text-fg">{words.heading(computer.name)}</h2>
        <p className="text-body text-fg-muted">{words.body}</p>
        {removed ? null : (
          <p className="text-small text-fg-muted">{standingWords.cantConfirm.nothingCleared}</p>
        )}
        <div className="mt-3 flex w-full flex-col gap-2">
          <Button variant="primary" size="touch" block onClick={onPairAgain}>
            {standingWords.pairAgain}
          </Button>
          <Button variant="ghost" size="touch" block onClick={() => setAsking(true)}>
            {standingWords.forgetThisComputer}
          </Button>
        </div>
      </div>
      {asking ? (
        <ForgetDialog
          computer={computer}
          onForget={onForget}
          onForgotten={() => {
            setAsking(false);
            onForgotten();
          }}
          onCancel={() => setAsking(false)}
        />
      ) : null}
    </div>
  );
}
