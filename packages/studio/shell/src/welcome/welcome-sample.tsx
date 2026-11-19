import { Button } from "@halonicjs/studio-kit";
import type { Ref } from "react";
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

/** The demo action and the time line under it (first-run-flow 3.1). */
export const trySampleWords = {
  action: "Open demo",
  creating: "Copying the demo…",
  /** What a screen reader hears while it is busy (microcopy 19); the demo always goes in Documents. */
  creatingName: "Copying the demo to Documents…",
  time: "New here? The demo takes about 4 minutes.",
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
  /** True once Recent has entries: the action is then a quiet link without the time line. */
  readonly quiet: boolean;
  /** True while the demo is being copied. */
  readonly busy: boolean;
  readonly onPress: () => void;
  /** The primary button's element, which Welcome focuses first while the demo leads. */
  readonly buttonRef?: Ref<HTMLButtonElement> | undefined;
  /** The time line's id, which describes the button while it leads; absent once quiet. */
  readonly timeId?: string | undefined;
}

/**
 * **Open demo** on the Welcome screen (`shell.welcome-sample`). While Recent is empty it is the
 * primary button, and Welcome shows the time line under the buttons as its description
 * (accessibility pass 1.3); once Recent has entries it is a ghost button under the list. While
 * busy it reads "Copying the demo…", keeps focus and ignores presses.
 *
 * @example
 * <TrySample quiet={false} busy={false} onPress={copyDemo} timeId={timeId} />
 */
export function TrySample({ quiet, busy, onPress, buttonRef, timeId }: TrySampleProps) {
  return (
    <Button
      {...(buttonRef === undefined ? {} : { ref: buttonRef })}
      variant={quiet ? "ghost" : "primary"}
      busy={busy}
      busyLabel={trySampleWords.creating}
      busyName={trySampleWords.creatingName}
      {...(quiet || timeId === undefined ? {} : { "aria-describedby": timeId })}
      onClick={onPress}
    >
      {trySampleWords.action}
    </Button>
  );
}
