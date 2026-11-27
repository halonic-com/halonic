import { errorKindOf } from "@halonicjs/std";
import {
  Button,
  type ButtonUnavailable,
  Callout,
  type CalloutHandle,
  CommandBox,
} from "@halonicjs/studio-kit";
import { type EngineWords, engineWords, isUntrustedRefusal } from "@halonicjs/studio-shell";
import { type RefObject, useEffect, useRef, useState } from "react";
import { AnswerElsewhere } from "../answer-elsewhere.ts";
import { wasDecidedElsewhere } from "../decide.ts";
import { ReviewTrustButton } from "./review-trust-button.tsx";

export { wasDecidedElsewhere };

/** The line above the bar when an answer wasn't recorded (mc 10.2). */
export const failedText = "Couldn't record your decision.";

/** The line when the engine refused an answer because the run isn't waiting for it any more (mc 10.2). */
export const decidedElsewhereText =
  "This is no longer waiting for you. It was answered somewhere else or the run moved on.";

/** The line when an answer was refused because the workspace isn't trusted (HAL-13973 TU1). */
export const untrustedText = "This workspace isn't trusted yet, so Halonic can't send your answer.";

/**
 * A card fills the item pane: its body scrolls and its bar of answers stays in sight under it. In a
 * short window (400 % zoom, a phone held sideways) that bar would leave the request no room, so the
 * body stops scrolling on its own and the bar follows the request, as a kit Dialog does (component
 * specs 8, "Short of room"). The item pane then scrolls the whole card. Every card is a lifted, inset
 * surface (HAL-19574) that clips its bar to its corners, but not in a short window: a flex item that
 * clips may shrink below its content, which would cut the bar off instead of letting the pane scroll.
 */
export const cardClasses =
  "m-2 flex min-h-0 flex-col overflow-hidden rounded-md border border-border bg-surface shadow-1 short:min-h-auto short:overflow-visible";
/** The scrolling body of a card, above its bar; see {@link cardClasses}. */
export const cardBodyClasses = "flex flex-col gap-4 overflow-y-auto p-4 short:overflow-visible";

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
  /** The id of a line above the title that a screen reader reads with it, as it takes focus. */
  readonly describedBy?: string | undefined;
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
  describedBy,
}: CardHeaderProps) {
  // The title asks for 10rem next to **Open run**. In a narrower card (a phone, or 400 % zoom)
  // the button goes on a line under it, on the right, so the title keeps the whole width.
  return (
    <header className="flex flex-wrap items-start gap-x-3 gap-y-2">
      <div className="min-w-0 flex-1 basis-40">
        <h2
          id={titleId}
          ref={heading}
          tabIndex={-1}
          aria-describedby={describedBy}
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
        <div className="ml-auto">
          <Button size="sm" onClick={onOpenRun}>
            Open run
          </Button>
        </div>
      )}
    </header>
  );
}

/**
 * An answer Studio can't send itself: the executor's sentence and the command line that sends it,
 * which no retry can replace. No command where no terminal can send it (D-A, HAL-12822).
 */
export interface ManualAnswer {
  readonly message: string;
  readonly command: string | undefined;
}

/**
 * The manual answer a failure holds: an {@link AnswerElsewhere}, or an `unavailable` error whose
 * `fix` is the command to run.
 */
export function manualAnswerOf(error: unknown): ManualAnswer | null {
  if (error instanceof AnswerElsewhere) return { message: error.message, command: error.fix };
  if (errorKindOf(error) !== "unavailable") return null;
  const { message, fix } = error as { message: string; fix?: unknown };
  return typeof fix === "string" && fix !== "" ? { message, command: fix } : null;
}

/**
 * The sentence after "Couldn't record your decision." for a failure **Try again** may fix: an
 * `unavailable` error without a command to run, such as another engine holding the workspace, or
 * a `denied` one that isn't about trust, such as a folder that isn't open or a served computer's
 * 403.
 */
export function failureDetailOf(error: unknown): string | null {
  if (!saysWhyItFailed(error)) return null;
  const { message } = error as { message: string };
  return message === "" ? null : message;
}

/** Whether a failure's message is the sentence {@link failureDetailOf} shows. */
function saysWhyItFailed(error: unknown): boolean {
  switch (errorKindOf(error)) {
    case "unavailable":
      return manualAnswerOf(error) === null;
    case "denied":
      return !isUntrustedRefusal(error);
    default:
      return false;
  }
}

/**
 * True for an answer refused because the workspace isn't trusted: the engine's
 * `workspace.untrusted` refusal, which it gives every answer of such a workspace the same way each
 * time, so no retry can help. Another `denied` is a failure with its own sentence.
 */
export function wasRefusedUntrusted(error: unknown): boolean {
  return isUntrustedRefusal(error);
}

/** What the bar shows for an answer that came too late: its sentence, and **Open run** when it can. */
export interface DecidedElsewhere {
  readonly openRun: (() => void) | undefined;
}

/** What the bar shows for an answer refused in a workspace that isn't trusted. */
export interface RefusedUntrusted {
  /**
   * Opens the workspace's trust check, with the button that opened it to give focus back to.
   * Without it the line has no **Review**.
   */
  readonly review: ((opener: HTMLElement | null) => void) | undefined;
  /** Where to fix it on the computer, in place of **Review**, when the window can't open the check. */
  readonly fixElsewhere?: string | undefined;
}

interface FailedLineProps {
  /** Shows "Couldn't record your decision." with **Try again** when set. */
  readonly onRetry: (() => void) | null;
  /** The failure's own sentence, after "Couldn't record your decision.", when set. */
  readonly detail?: string | null;
  /** Shows the executor's sentence and the command to copy, with no **Try again**, when set. */
  readonly manual?: ManualAnswer | null;
  /** Shows "This is no longer waiting for you." with **Open run**, in place of **Try again**, when set. */
  readonly elsewhere?: DecidedElsewhere | null;
  /**
   * Shows this sentence, the host's {@link EngineWords.tooOldToAnswer}, in an info Callout like
   * "This is no longer waiting for you.", with no **Try again**, when set.
   */
  readonly tooOld?: string | null;
  /** Shows "This workspace isn't trusted yet, …" with **Review**, in place of **Try again**, when set. */
  readonly untrusted?: RefusedUntrusted | null;
}

/**
 * The bar's always-mounted alert slot, above its buttons (a11y 8.3). Its sentences come before its
 * button, on screen and in the DOM, so the alert reads them first (WCAG 1.3.2). When it fills, the
 * bar's focused button is brought back into view, since the lines above it can push it out of a
 * phone's window (WCAG 2.4.11).
 */
export function FailedLine(props: FailedLineProps) {
  const slot = useRef<HTMLDivElement | null>(null);
  const shown = shownLine(props);
  const kind = shown?.kind ?? null;
  useEffect(() => {
    if (kind === null) return;
    const focused = slot.current?.ownerDocument.activeElement;
    if (focused instanceof HTMLElement && slot.current?.parentElement?.contains(focused)) {
      focused.scrollIntoView({ block: "nearest" });
    }
  }, [kind]);
  return (
    <div ref={slot} role="alert" className="text-small text-fg">
      {shown === null ? null : <ShownLine shown={shown} />}
    </div>
  );
}

/** The line the alert slot shows: the first of {@link FailedLineProps} that is set. */
type Shown =
  | { readonly kind: "manual"; readonly manual: ManualAnswer }
  | { readonly kind: "elsewhere"; readonly elsewhere: DecidedElsewhere }
  | { readonly kind: "too-old"; readonly tooOld: string }
  | { readonly kind: "untrusted"; readonly untrusted: RefusedUntrusted }
  | { readonly kind: "failed"; readonly onRetry: () => void; readonly detail: string | null };

function shownLine({
  onRetry,
  detail = null,
  manual = null,
  elsewhere = null,
  tooOld = null,
  untrusted = null,
}: FailedLineProps): Shown | null {
  if (manual !== null) return { kind: "manual", manual };
  if (elsewhere !== null) return { kind: "elsewhere", elsewhere };
  if (tooOld !== null) return { kind: "too-old", tooOld };
  if (untrusted !== null) return { kind: "untrusted", untrusted };
  return onRetry === null ? null : { kind: "failed", onRetry, detail };
}

function ShownLine({ shown }: { readonly shown: Shown }) {
  switch (shown.kind) {
    case "manual":
      return (
        <span className="flex flex-col gap-2">
          {shown.manual.message}
          {shown.manual.command === undefined ? null : (
            <CommandBox command={shown.manual.command} />
          )}
        </span>
      );
    case "elsewhere": {
      const { openRun } = shown.elsewhere;
      return (
        <Callout
          tone="info"
          {...(openRun === undefined ? {} : { action: { label: "Open run", onClick: openRun } })}
        >
          {decidedElsewhereText}
        </Callout>
      );
    }
    case "too-old":
      return <Callout tone="info">{shown.tooOld}</Callout>;
    case "untrusted": {
      const { review, fixElsewhere } = shown.untrusted;
      return (
        <span className="flex flex-wrap items-center gap-2">
          {untrustedText}
          {review === undefined ? null : <ReviewTrustButton review={review} />}
          {fixElsewhere === undefined ? null : <span className="basis-full">{fixElsewhere}</span>}
        </span>
      );
    }
    case "failed":
      return (
        <span className="flex flex-wrap items-center gap-2">
          {shown.detail === null ? failedText : `${failedText} ${shown.detail}`}
          <Button variant="ghost" size="sm" onClick={shown.onRetry}>
            Try again
          </Button>
        </span>
      );
  }
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

/** The line over a card's bar when the served Studio's sign-in ended, as the computer's refusal words it. */
export const signedOutText = "Sign in again to send your answer.";

/** What a card's bar takes to know the engine isn't answering (UX check item 9). */
export interface EngineState {
  /** `false` while the engine isn't answering: the buttons stay, but don't act. */
  readonly answering?: boolean;
  /**
   * Whether the list stopped loading because the sign-in ended (a served Studio): the engine
   * still answers, so the line says to sign in again rather than that it isn't answering.
   */
  readonly signedOut?: boolean;
  /** The host's words for it; the desktop app's when left out. */
  readonly words?: EngineWords;
}

/**
 * The line over a card's bar while the engine isn't answering, "showing what it said last", or,
 * signed out, "Sign in again to send your answer.", which the decision buttons point at as their
 * reason. Nothing while it answers.
 */
export function NotAnsweringLine({
  id,
  answering = true,
  signedOut = false,
  words = engineWords["desktop-app"],
}: EngineState & { readonly id: string }) {
  if (answering) return null;
  return (
    <p id={id} className="text-small text-fg-muted">
      {signedOut ? signedOutText : words.showingLast}
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
