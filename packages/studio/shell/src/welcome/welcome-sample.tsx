import { Button } from "@halonicjs/studio-kit";
import { useId } from "react";
import { cantOpenWords } from "./cant-open.ts";

/** Why the demo couldn't be copied: the folder it goes in, as the user knows it, and the reason. */
export interface WelcomeSampleProblem {
  /** Where the sample was meant to go, such as "Documents". */
  readonly folder: string;
  /** Why nothing was written, such as "permission denied". */
  readonly reason: string;
  /** True when the engine didn't answer: the line then says so, never `reason`. */
  readonly unavailable?: true;
}

/** The demo action and its cost line (microcopy 5, flow-first-run 2.1, first-run-flow 8a). */
export const trySampleWords = {
  action: "Open demo",
  creating: "Copying the demo…",
  /** What a screen reader hears while it is busy (microcopy 19); the demo always goes in Documents. */
  creatingName: "Copying the demo to Documents…",
  cost: "Runs on the built-in test model, with scripted replies. No key, no cost.",
} as const;

/** The sentence under Welcome's text when the demo couldn't be copied, with a closing full stop. */
export function cantCreateSampleLine(problem: WelcomeSampleProblem): string {
  if (problem.unavailable === true) {
    return `Can't copy the demo to ${problem.folder}: ${cantOpenWords.silent}`;
  }
  const reason = problem.reason.endsWith(".") ? problem.reason : `${problem.reason}.`;
  return `Can't copy the demo to ${problem.folder}: ${reason}`;
}

/** Props for {@link TrySample}. */
export interface TrySampleProps {
  /** True once Recent has entries: the action is then a quiet link without the cost line. */
  readonly quiet: boolean;
  /** True while the demo is being copied. */
  readonly busy: boolean;
  readonly onPress: () => void;
}

/**
 * **Open demo** on the Welcome screen (`shell.welcome-sample`). While Recent is
 * empty it is a secondary button with the cost line under it; once Recent has entries it is a
 * ghost button under the list, without the cost line. The cost line is the button's description
 * (accessibility pass 1.3). While busy it reads "Copying the demo…",
 * keeps focus and ignores presses.
 *
 * @example
 * <TrySample quiet={false} busy={false} onPress={copyDemo} />
 */
export function TrySample({ quiet, busy, onPress }: TrySampleProps) {
  const costId = useId();
  return (
    <div className="flex flex-col items-center gap-1">
      <Button
        variant={quiet ? "ghost" : "secondary"}
        busy={busy}
        busyLabel={trySampleWords.creating}
        busyName={trySampleWords.creatingName}
        {...(quiet ? {} : { "aria-describedby": costId })}
        onClick={onPress}
      >
        {trySampleWords.action}
      </Button>
      {quiet ? null : (
        <p id={costId} className="text-small text-fg-muted">
          {trySampleWords.cost}
        </p>
      )}
    </div>
  );
}
