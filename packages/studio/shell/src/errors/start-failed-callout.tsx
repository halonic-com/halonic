import { errorKindOf } from "@halonicjs/std";
import { Callout, type CalloutAction, type CalloutHandle, CommandBox } from "@halonicjs/studio-kit";
import { useEffect, useRef } from "react";
import { useCopyDetails } from "../page/copy-details.ts";
import { copyDetailsWords, detailsOf } from "./copy-details-words.ts";
import { startFailureOf, withFullStop } from "./start-failure.ts";

/** The approved words of a run that didn't start (microcopy 1.6, UX check S1 and S2). */
export const startFailedWords = {
  couldntStart: (reason: string) => `Couldn't start the run: ${reason}`,
  tryAgain: "Try again",
  /** The trust check's own word, on a start refused because the workspace isn't trusted (C144 RT1). */
  review: "Review",
} as const;

/** Props for {@link StartFailedCallout}. */
export interface StartFailedCalloutProps {
  /** What the start rejected with. */
  readonly error: unknown;
  /** The reason for an engine that can't be reached, in the words for where Studio runs. */
  readonly notAnswering: string;
  /** Starts the run again, for **Try again**. */
  readonly tryAgain: () => void | Promise<void>;
  /**
   * Opens the workspace's trust check; absent where there is none. A start refused because the
   * workspace isn't trusted (`denied`) then offers **Review** in place of **Try again** (C144 RT1).
   */
  readonly review?: (() => void) | undefined;
  /** Moves focus to the Callout when it shows a failure, as the Run panel's card does (D7). */
  readonly takeFocus?: boolean;
}

/**
 * A run that didn't start, said the same way by the Run panel's **Start run** and the run page's
 * **Run again** (UX check S1, S2 and S4, HAL-12390): a danger Callout with "Couldn't start the
 * run: *reason*", the next step on its own line, the command it leads to in a CommandBox, then
 * **Try again** and **Copy details** as {@link startFailureOf} decides. A refusal because the
 * workspace isn't trusted has **Review** instead of **Try again** when `review` is given.
 *
 * @example
 * <StartFailedCallout error={error} notAnswering={engine.notAnswering} tryAgain={start} />
 */
export function StartFailedCallout({
  error,
  notAnswering,
  tryAgain,
  review,
  takeFocus = false,
}: StartFailedCalloutProps) {
  const callout = useRef<CalloutHandle>(null);
  const copyDetails = useCopyDetails();
  useEffect(() => {
    if (takeFocus) callout.current?.focus();
  }, [takeFocus, error]);
  const failure = startFailureOf(error, notAnswering);
  const line = startFailedWords.couldntStart(failure.reason);
  const untrusted = review !== undefined && errorKindOf(error) === "denied";
  const actions: CalloutAction[] = [
    ...(untrusted ? [{ label: startFailedWords.review, onClick: review }] : []),
    ...(failure.tryAgain && !untrusted
      ? [{ label: startFailedWords.tryAgain, onClick: tryAgain }]
      : []),
    ...(failure.copyDetails
      ? [
          {
            label: copyDetailsWords.label,
            onClick: () => copyDetails(detailsOf(line, error)),
          },
        ]
      : []),
  ];
  return (
    <Callout
      tone="danger"
      {...(takeFocus ? { announce: "focus" as const, ref: callout } : {})}
      {...(actions.length > 0 ? { action: actions } : {})}
    >
      <p>{line}</p>
      {failure.fix === undefined ? null : <p>{withFullStop(failure.fix)}</p>}
      {failure.command === undefined ? null : <CommandBox command={failure.command} />}
    </Callout>
  );
}
