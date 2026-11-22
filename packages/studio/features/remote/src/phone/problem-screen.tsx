import { Button, WarningIcon } from "@halonicjs/studio-kit";
import { useEffect, useRef } from "react";
import { MarkedText } from "./marked-text.tsx";
import { pairWords } from "./pair-words.ts";
import type { PairingFrom, PairingProblemScreen } from "./phone-pairing.ts";

/** The problem screens drawn on their own; `typedWrong` is the typed route's screen with its error. */
export type ProblemScreenOf = Exclude<PairingProblemScreen, { screen: "typedWrong" }>;

/**
 * What a problem screen's main button does: `again` starts over on the route the pairing came from
 * (Scan again, Type a code again), for a code that is spent; `tryAgain` sends the same code again.
 */
export type ProblemAction = "again" | "tryAgain";

/** A problem screen's words and buttons. */
export interface ProblemWords {
  readonly title: string;
  /** One paragraph each; `**Bold**` marks a control's name. */
  readonly lines: readonly string[];
  readonly action: ProblemAction;
  readonly actionLabel: string;
  /** Cancel under the main button, where the design draws it (`p-m8`, G25, G26). */
  readonly cancel: boolean;
}

/** The words of a problem screen (`p-m6` to `p-m10`, G25, G26, microcopy 28), for `computer`. */
export function problemWords(
  problem: ProblemScreenOf,
  computer: string,
  from: PairingFrom,
): ProblemWords {
  const typed = from.route === "typed";
  const again = (title: string, lines: readonly string[]): ProblemWords => ({
    title,
    lines,
    action: "again",
    actionLabel: typed ? pairWords.typeAgain : pairWords.scanAgain,
    cancel: false,
  });
  const tryAgain = (title: string, line: string): ProblemWords => ({
    title,
    lines: [line],
    action: "tryAgain",
    actionLabel: pairWords.unreachable.tryAgain,
    cancel: true,
  });
  switch (problem.screen) {
    case "ended":
      return again(pairWords.ended.title, [
        problem.noAllow ? pairWords.ended.bodyNoAllow(computer) : pairWords.ended.body,
      ]);
    case "used":
      return again(pairWords.used.title, [
        pairWords.used.body(computer),
        typed ? pairWords.used.nextTyped : pairWords.used.next,
      ]);
    case "refused":
      return again(pairWords.refused.title(computer), [pairWords.refused.body]);
    case "unreadable":
      return again(pairWords.unreadable.title(computer), [pairWords.unreadable.body]);
    case "generic":
      return again(pairWords.generic.title, [pairWords.generic.body]);
    case "cantConfirm":
      // Scan route only (G26): Scan again, with Cancel under it.
      return {
        ...again(pairWords.cantConfirm.title(computer), [pairWords.cantConfirm.body(computer)]),
        cancel: true,
      };
    case "rateLimited":
      return tryAgain(pairWords.rateLimited.title(computer), pairWords.rateLimited.body);
    case "unreachable":
      if (problem.phoneOffline) {
        const body = problem.wifi ? pairWords.phoneOffline.bodyWifi : pairWords.phoneOffline.body;
        return tryAgain(pairWords.phoneOffline.title, body(computer));
      }
      return tryAgain(
        pairWords.unreachable.title(computer),
        problem.wifi ? pairWords.unreachable.bodyWifi : pairWords.unreachable.body,
      );
  }
}

/**
 * A pairing problem screen, under the page's "Pair with a computer" header: the amber tile, the
 * title, its line and the way on. The title takes focus when the screen shows, so TalkBack reads
 * it (strings table, Other announcements); no live region is needed.
 */
export function ProblemScreen({
  problem,
  computer,
  from,
  onAction,
  onCancel,
}: {
  readonly problem: ProblemScreenOf;
  /** The computer's own name: "Tim's laptop". */
  readonly computer: string;
  readonly from: PairingFrom;
  readonly onAction: (action: ProblemAction) => void;
  readonly onCancel: () => void;
}) {
  const words = problemWords(problem, computer, from);
  const heading = useRef<HTMLHeadingElement>(null);
  // A new problem is a new screen, so its title is read again.
  useEffect(() => heading.current?.focus(), [words.title]);
  return (
    <div className="grid min-h-full place-items-center px-6 py-8">
      <div className="flex max-w-empty flex-col items-center gap-3 text-center">
        <span
          aria-hidden="true"
          className="mb-1 inline-grid size-14 place-items-center rounded-lg bg-attention-soft text-attention"
        >
          <span className="inline-grid size-icon-md place-items-center *:size-full">
            <WarningIcon />
          </span>
        </span>
        <h2 ref={heading} tabIndex={-1} className="text-title text-fg focus-ring">
          {words.title}
        </h2>
        {words.lines.map((line) => (
          <p key={line} className="text-body text-fg-muted">
            <MarkedText text={line} />
          </p>
        ))}
        <div className="mt-3 flex w-full flex-col gap-2">
          <Button variant="primary" size="touch" block onClick={() => onAction(words.action)}>
            {words.actionLabel}
          </Button>
          {words.cancel ? (
            <Button variant="ghost" size="touch" block onClick={onCancel}>
              {pairWords.unreachable.cancel}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
