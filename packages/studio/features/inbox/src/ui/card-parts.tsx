import { errorKindOf } from "@halonicjs/std";
import {
  Button,
  type ButtonUnavailable,
  Callout,
  type CalloutHandle,
  CommandBox,
} from "@halonicjs/studio-kit";
import { type EngineWords, engineWords } from "@halonicjs/studio-shell";
import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import { wasDecidedElsewhere } from "../decide.ts";
import { PlainValue } from "./plain-value.tsx";

export { wasDecidedElsewhere };

/** The line above the bar when an answer wasn't recorded (mc 10.2). */
export const failedText = "Couldn't record your decision.";

/** The line when the engine refused an answer because the run isn't waiting for it any more (mc 10.2). */
export const decidedElsewhereText =
  "This is no longer waiting for you. It was answered somewhere else or the run moved on.";

/**
 * A card fills the item pane: its body scrolls and its bar of answers stays in sight under it. In a
 * short window (400 % zoom, a phone held sideways) that bar would leave the request no room, so the
 * body stops scrolling on its own and the bar follows the request, as a kit Dialog does (component
 * specs 8, "Short of room"). The item pane then scrolls the whole card.
 */
export const cardClasses = "flex min-h-0 flex-col short:min-h-auto";
/** The scrolling body of a card, above its bar; see {@link cardClasses}. */
export const cardBodyClasses = "flex flex-col gap-4 overflow-y-auto p-4 short:overflow-visible";

/** The item after this one, for the decided card's **Next** (flow-inbox 5.3). */
export interface NextItem {
  readonly title: string;
  /** Items still waiting, this one not counted. */
  readonly left: number;
  readonly open: () => void;
}

/**
 * Where you came from, for the decided card's way back (flow-inbox 5.3, 8.2): a run's
 * **Review in Inbox** gives **Back to run 01JD8Q**, an agent chat's **Back to the chat with
 * Mailbot**. `null` when you opened the Inbox itself.
 */
export type BackLink =
  | {
      readonly kind: "run";
      /** The run's name as Studio shows it, such as `01JD8Q`. */
      readonly runName: string;
      readonly open: () => void;
    }
  | {
      readonly kind: "chat";
      /** The agent's name as the workspace shows it. */
      readonly agentName: string;
      readonly open: () => void;
    };

/** The way back's label: "Back to run 01JD8Q" or "Back to the chat with Mailbot" (microcopy 19). */
export function backLabel(back: BackLink): string {
  return back.kind === "run"
    ? `Back to run ${back.runName}`
    : `Back to the chat with ${back.agentName}`;
}

interface CardHeaderProps {
  readonly titleId: string;
  readonly title: string;
  readonly heading: RefObject<HTMLHeadingElement | null>;
  /** "Waiting since 10:42 (1 min)", or `null` once decided: the card no longer waits. */
  readonly since: string | null;
  /** What started the run, after "Started by": "you, with Run"; left out, the line isn't shown. */
  readonly startedBy?: string | undefined;
  /** Opens the run; leave it out while the Studio has no run page, and the button isn't shown. */
  readonly onOpenRun?: (() => void) | undefined;
}

/**
 * Renders the card again every minute while it's open, so its "Waiting since
 * 10:42 (1 min)" keeps counting.
 */
export function useEveryMinute(): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((tick) => tick + 1), 60_000);
    return () => clearInterval(timer);
  }, []);
}

/**
 * A card's header: its title, which takes focus when it opens, since when it waits while it
 * does, what started the run, and **Open run** (flow-inbox 5.3).
 */
export function CardHeader({
  titleId,
  title,
  heading,
  since,
  startedBy,
  onOpenRun,
}: CardHeaderProps) {
  return (
    <header className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <h2
          id={titleId}
          ref={heading}
          tabIndex={-1}
          className="focus-ring text-title text-fg wrap-break-word"
        >
          {title}
        </h2>
        {since === null ? null : <p className="text-small text-fg-muted">{since}</p>}
        {startedBy === undefined ? null : (
          <p className="text-small text-fg-muted">Started by {startedBy}</p>
        )}
      </div>
      {onOpenRun === undefined ? null : (
        <Button size="sm" onClick={onOpenRun}>
          Open run
        </Button>
      )}
    </header>
  );
}

interface DecidedBarProps {
  readonly text: string;
  /** The note you sent, under `text` as plain text, folded when long. */
  readonly note?: string;
  readonly next: NextItem | null;
  readonly back: BackLink | null;
  readonly callout: RefObject<CalloutHandle | null>;
}

/**
 * The bar once decided: the decided Callout, which takes focus, then the way back, secondary,
 * and **Next** (flow-inbox 5.3). The way back stays when nothing else waits, so you're never
 * left without one.
 *
 * The Callout takes focus without scrolling, so the bar brings itself into view when it appears:
 * in a short window, where the whole column scrolls, the shorter bar would otherwise leave the
 * line below the window (HAL-13918). It scrolls whichever element scrolls the card, only as far
 * as it must: the whole bar when it fits, else from its top, so the line shows whole. It does so
 * before the bar is drawn, so the window never shows it out of view first. The effect returns
 * nothing: Chromium's `scrollIntoView` returns a promise, which React would take for a clean-up
 * and fail on when the bar goes away.
 */
export function DecidedBar({ text, note, next, back, callout }: DecidedBarProps) {
  const bar = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    bar.current?.scrollIntoView?.({ block: "nearest" });
  }, []);
  return (
    <div ref={bar} className="flex flex-col gap-3 border-t border-border p-4">
      <Callout tone="info" announce="focus" ref={callout}>
        {text}
        {note === undefined ? null : (
          <>
            {" "}
            <PlainValue text={note} />
          </>
        )}
      </Callout>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {back === null ? null : <Button onClick={back.open}>{backLabel(back)}</Button>}
        {next === null ? (
          <p className="text-small text-fg-muted">Nothing else is waiting for you.</p>
        ) : (
          <Button variant="primary" onClick={next.open}>
            {`Next: ${next.title}`}
            <span aria-hidden="true">{` · ${next.left} left`}</span>
            <span className="sr-only">{`, ${next.left} left`}</span>
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * An answer Studio can't send itself: the executor's sentence and the command line that sends it,
 * which no retry can replace.
 */
export interface ManualAnswer {
  readonly message: string;
  readonly command: string;
}

/** The manual answer a failure holds: an `unavailable` error whose `fix` is the command to run. */
export function manualAnswerOf(error: unknown): ManualAnswer | null {
  if (errorKindOf(error) !== "unavailable") return null;
  const { message, fix } = error as { message: string; fix?: unknown };
  return typeof fix === "string" && fix !== "" ? { message, command: fix } : null;
}

/** What the bar shows for an answer that came too late: its sentence, and **Open run** when it can. */
export interface DecidedElsewhere {
  readonly openRun: (() => void) | undefined;
}

interface FailedLineProps {
  /** Shows "Couldn't record your decision." with **Try again** when set. */
  readonly onRetry: (() => void) | null;
  /** Shows the executor's sentence and the command to copy, with no **Try again**, when set. */
  readonly manual?: ManualAnswer | null;
  /** Shows "This is no longer waiting for you." with **Open run**, in place of **Try again**, when set. */
  readonly elsewhere?: DecidedElsewhere | null;
}

/** The bar's always-mounted alert slot, above its buttons (a11y 8.3). */
export function FailedLine({ onRetry, manual = null, elsewhere = null }: FailedLineProps) {
  return (
    <div role="alert" className="text-small text-fg">
      {manual === null ? null : (
        <span className="flex flex-col gap-2">
          {manual.message}
          <CommandBox command={manual.command} />
        </span>
      )}
      {elsewhere === null ? null : (
        <Callout
          tone="info"
          {...(elsewhere.openRun === undefined
            ? {}
            : { action: { label: "Open run", onClick: elsewhere.openRun } })}
        >
          {decidedElsewhereText}
        </Callout>
      )}
      {manual !== null || elsewhere !== null || onRetry === null ? null : (
        <span className="flex flex-wrap items-center gap-2">
          {failedText}
          <Button variant="ghost" size="sm" onClick={onRetry}>
            Try again
          </Button>
        </span>
      )}
    </div>
  );
}

/**
 * The bar of a card whose run no longer waits for it (flow-inbox 5.4, INBOX-CARD-31): "This is no
 * longer waiting for you. …" with **Open run**, in place of the answers. The buttons that had
 * focus are gone, so focus moves to it, but only from inside the card, never from elsewhere.
 */
export function StaleBar({
  card,
  openRun,
}: {
  readonly card: RefObject<HTMLElement | null>;
  readonly openRun: (() => void) | undefined;
}) {
  const line = useRef<CalloutHandle>(null);
  useEffect(() => {
    const active = document.activeElement;
    if (active === document.body || card.current?.contains(active)) line.current?.focus();
  }, [card]);
  return (
    <div className="border-t border-border p-4">
      <Callout
        tone="info"
        announce="focus"
        ref={line}
        {...(openRun === undefined ? {} : { action: { label: "Open run", onClick: openRun } })}
      >
        {decidedElsewhereText}
      </Callout>
    </div>
  );
}

/** What a card's bar takes to know the engine isn't answering (UX check item 9). */
export interface EngineState {
  /** `false` while the engine isn't answering: the buttons stay, but don't act. */
  readonly answering?: boolean;
  /** The host's words for it; the desktop app's when left out. */
  readonly words?: EngineWords;
}

/**
 * The line over a card's bar while the engine isn't answering, "showing what it said last",
 * which the decision buttons point at as their reason. Nothing while it answers.
 */
export function NotAnsweringLine({
  id,
  answering = true,
  words = engineWords["desktop-app"],
}: EngineState & { readonly id: string }) {
  if (answering) return null;
  return (
    <p id={id} className="text-small text-fg-muted">
      {words.showingLast}
    </p>
  );
}

/** What a decision button gets while the engine isn't answering: focusable, no action, a reason. */
export function unavailableWhile(
  answering: boolean,
  reasonId: string,
): ButtonUnavailable | undefined {
  return answering ? undefined : { reason: reasonId };
}
