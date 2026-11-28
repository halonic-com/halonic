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
  /** What a screen reader hears while it copies to Documents (microcopy 19); `creating` elsewhere. */
  creatingName: "Copying the demo to Documents…",
  time: "New here? The demo takes about 4 minutes.",
  /** The ways out of a copy that failed (`shell.welcome-sample-error`). */
  tryAgain: "Try again",
  chooseFolder: "Choose a folder…",
} as const;

/** The sentence under Welcome's text when the demo couldn't be copied, with a closing full stop. */
export function cantCreateSampleLine(problem: WelcomeSampleProblem): string {
  if (problem.unavailable === true) {
    return `Couldn't copy the demo to ${problem.folder}: ${cantOpenWords.silent}`;
  }
  const reason = problem.reason.endsWith(".") ? problem.reason : `${problem.reason}.`;
  return `Couldn't copy the demo to ${problem.folder}: ${reason}`;
}

/** Props for {@link TrySample}. */
export interface TrySampleProps {
  /** True once Recent has entries: the action is then a quiet link without the time line. */
  readonly quiet: boolean;
  /** True while the demo is being copied. */
  readonly busy: boolean;
  /** True while it is copied into a folder the person picked: the busy name then names no folder. */
  readonly elsewhere?: boolean | undefined;
  readonly onPress: () => void;
  /** The primary button's element, which Welcome focuses first while the demo leads. */
  readonly buttonRef?: Ref<HTMLButtonElement> | undefined;
  /** The time line's id, which describes the button while it leads; absent once quiet. */
  readonly timeId?: string | undefined;
  /** The id of the line that says why it's off while Halonic starts (`shell.welcome-start`). */
  readonly offId?: string | undefined;
}

/**
 * **Open demo** on the Welcome screen (`shell.welcome-sample`). While Recent is empty it is the
 * primary button, and Welcome shows the time line under the buttons as its description
 * (accessibility pass 1.3); once Recent has entries it is a ghost button under the list. While
 * busy it reads "Copying the demo…", keeps focus and ignores presses. With `offId` it is off,
 * and screen readers hear the line that says why.
 *
 * @example
 * <TrySample quiet={false} busy={false} onPress={copyDemo} timeId={timeId} />
 */
export function TrySample({
  quiet,
  busy,
  elsewhere = false,
  onPress,
  buttonRef,
  timeId,
  offId,
}: TrySampleProps) {
  return (
    <Button
      {...(buttonRef === undefined ? {} : { ref: buttonRef })}
      variant={quiet ? "ghost" : "primary"}
      busy={busy}
      unavailable={busy || offId === undefined ? undefined : { reason: offId }}
      busyLabel={trySampleWords.creating}
      busyAlign="center"
      busyName={elsewhere ? trySampleWords.creating : trySampleWords.creatingName}
      {...(quiet || timeId === undefined ? {} : { "aria-describedby": timeId })}
      onClick={onPress}
    >
      {trySampleWords.action}
    </Button>
  );
}

/** Props for {@link SampleProblemBlock}. */
export interface SampleProblemBlockProps {
  /** Why the last copy failed; without one nothing shows. */
  readonly problem: WelcomeSampleProblem | undefined;
  /** Copies the demo to Documents again, as **Open demo** does. */
  readonly onTryAgain: () => void;
  /** Whether the app can copy the demo into another folder: else there's no **Choose a folder…**. */
  readonly canChooseFolder: boolean;
  /** Shows the folder picker and copies the demo into the folder picked. */
  readonly onChooseFolder: () => void;
}

/**
 * Why the demo couldn't be copied, right under the **Open demo** that was pressed, with
 * **Try again** and, when the app can copy it elsewhere, **Choose a folder…**
 * (`shell.welcome-sample-error`). It only shows while there is a problem, so the line is announced
 * as it appears.
 *
 * @example
 * <SampleProblemBlock problem={problem} onTryAgain={copy} canChooseFolder onChooseFolder={copyElsewhere} />
 */
export function SampleProblemBlock({
  problem,
  onTryAgain,
  canChooseFolder,
  onChooseFolder,
}: SampleProblemBlockProps) {
  if (problem === undefined) {
    return null;
  }
  return (
    <div className="flex flex-col items-center gap-2">
      <p role="alert" className="text-body text-danger break-words">
        {cantCreateSampleLine(problem)}
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Button variant="secondary" onClick={onTryAgain}>
          {trySampleWords.tryAgain}
        </Button>
        {canChooseFolder ? (
          <Button variant="ghost" onClick={onChooseFolder}>
            {trySampleWords.chooseFolder}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
