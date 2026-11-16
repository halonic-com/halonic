import { errorKindOf } from "@halonicjs/std";
import {
  Button,
  type ButtonUnavailable,
  Callout,
  type CalloutHandle,
  CommandBox,
} from "@halonicjs/studio-kit";
import { type EngineWords, engineWords } from "@halonicjs/studio-shell";
import { type RefObject, useEffect, useState } from "react";
import { PlainValue } from "./plain-value.tsx";

/** The line above the bar when an answer wasn't recorded (mc 10.2). */
export const failedText = "Couldn't record your decision.";

/** The line when the engine refused an answer because the run isn't waiting for it any more (mc 10.2). */
export const decidedElsewhereText =
  "This is no longer waiting for you. It was answered somewhere else or the run moved on.";

/** The engine's refusals that mean "not waiting for this answer any more", so trying again can't work. */
const staleAnswerCodes: ReadonlySet<string> = new Set([
  "engine.decision-callid-must-match",
  "engine.decision-wait-must-match",
]);

/**
 * Whether an answer was refused because its tool call or wait step isn't the run's current one.
 * The refusal's `code` is read, and its message too: it may reach Studio as a plain `Error`.
 */
export function wasDecidedElsewhere(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return [code, message].some((each) => typeof each === "string" && staleAnswerCodes.has(each));
}

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
 * does, and **Open run** (flow-inbox 5.3).
 */
export function CardHeader({ titleId, title, heading, since, onOpenRun }: CardHeaderProps) {
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
 */
export function DecidedBar({ text, note, next, back, callout }: DecidedBarProps) {
  return (
    <div className="flex flex-col gap-3 border-t border-border p-4">
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
