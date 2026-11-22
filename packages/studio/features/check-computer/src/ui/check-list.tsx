import {
  CloseIcon,
  InfoIcon,
  standaloneLinkClasses,
  TickIcon,
  WarningIcon,
} from "@halonicjs/studio-kit";
import type { ReactNode } from "react";
import type { CheckFact } from "../check-facts.ts";
import type { CheckMark } from "../check-marks.ts";
import type { CheckAction, CheckLine, LineSentence } from "../lines/check-line.ts";

/** What a line's button does, by its action; an action without one isn't shown. */
export type ActionHandlers = Readonly<Partial<Record<CheckAction, (fact: CheckFact) => void>>>;

/** The buttons' words (first-run-progress section 9). */
const actionLabels: Readonly<Record<CheckAction, string>> = {
  "review-trust": "Review",
  "open-models": "Open Models",
  "test-again": "Test again",
  "pick-model": "Pick another model",
  "open-run": "Open the run",
  "check-again": "Check again",
  "continue-setup": "Continue",
  "start-over": "Start over…",
};

/** The screen's marks are the report's glyphs (✓ ✕ ! –), as the window's own check draws them. */
const markIcons: Readonly<Record<CheckMark, ReactNode>> = {
  pass: <TickIcon />,
  problem: <CloseIcon />,
  warning: <WarningIcon />,
  info: <InfoIcon />,
};

const markColours: Readonly<Record<CheckMark, string>> = {
  pass: "text-success",
  problem: "text-danger",
  warning: "text-attention",
  info: "text-fg-subtle",
};

/** What a screen reader hears for a mark, after the label: "Models, problem: …" (section 5). */
const markNames: Readonly<Record<CheckMark, string>> = {
  pass: "works",
  problem: "problem",
  warning: "warning",
  info: "info",
};

function Sentence({ sentence }: { readonly sentence: LineSentence }) {
  return (
    <p className={sentence.kind === "fix" ? "text-fg-muted" : "text-fg"}>
      {sentence.parts.map((part, index) =>
        typeof part === "string" ? (
          part
        ) : (
          // A sentence's parts never move, so their place is a stable key.
          <code key={index} className="font-mono">
            {part.code}
          </code>
        ),
      )}
    </p>
  );
}

function LineItem({
  line,
  handlers,
}: {
  readonly line: CheckLine;
  readonly handlers: ActionHandlers;
}) {
  const actions = line.actions.flatMap((action) => {
    const handler = handlers[action];
    return handler === undefined ? [] : [{ action, handler }];
  });
  return (
    <li className="grid grid-cols-[auto_8rem_1fr] items-start gap-x-3 px-4 py-3 text-small phone:grid-cols-[auto_1fr]">
      <span
        aria-hidden="true"
        className={`mt-0.5 inline-grid size-icon-sm place-items-center *:size-full ${markColours[line.mark]}`}
      >
        {markIcons[line.mark]}
      </span>
      <span className="font-medium text-fg">
        {line.label}
        <span className="sr-only">, {markNames[line.mark]}:</span>
      </span>
      <div className="flex min-w-0 flex-col gap-1 wrap-break-word phone:col-start-2">
        {line.sentences.map((sentence, index) => (
          // A line's sentences keep their order, so their place is a stable key.
          <Sentence key={index} sentence={sentence} />
        ))}
        {actions.length === 0 ? null : (
          <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
            {actions.map(({ action, handler }) => (
              <button
                key={action}
                type="button"
                className={standaloneLinkClasses}
                onClick={() => handler(line.fact)}
              >
                {actionLabels[action]}
              </button>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}

/**
 * The lines of Check this computer as a list (first-run-progress 4.1 and 5): each line's mark is
 * an icon and words, never only a colour, and its state is part of what a screen reader hears.
 */
export function CheckList({
  lines,
  handlers,
}: {
  readonly lines: readonly CheckLine[];
  readonly handlers: ActionHandlers;
}) {
  return (
    <ul className="divide-y divide-border rounded-md border border-border">
      {lines.map((line) => (
        <LineItem key={line.id} line={line} handlers={handlers} />
      ))}
    </ul>
  );
}
