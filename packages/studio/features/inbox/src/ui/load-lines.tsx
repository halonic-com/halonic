import { Callout, clockTime } from "@halonicjs/studio-kit";
import { EngineNotAnswering, type EngineWords, errorMessageFor } from "@halonicjs/studio-shell";

/** The title when the Inbox's first load fails. */
export const loadFailed = "Couldn't load the Inbox";

/**
 * Why the Inbox couldn't load: a kinded error's own reason, else that the engine isn't answering,
 * as mc 10.1 says it, since a load that fails without a kind never reached the engine.
 */
export function failureReason(error: unknown, words: EngineWords): string {
  const message = errorMessageFor(error, { title: loadFailed });
  const reason = message.body.trim();
  return message.kind === "internal" || reason === "" ? words.notAnswering : reason;
}

/** Whether the load failed because the served Studio's sign-in ended: the engine still answers. */
export function isSignedOut(error: unknown): boolean {
  return (
    error !== undefined && errorMessageFor(error, { title: loadFailed }).kind === "unauthenticated"
  );
}

/**
 * The line over Home's Needs you once the served Studio's sign-in ended, the one the Inbox's list
 * shows then, in a polite status that is always there so it is read once (HAL-13830 HM1). Any
 * other failed load shows no line: the rows stay as they were.
 */
export function SignedOutLine({
  error,
  words,
}: {
  readonly error: unknown;
  readonly words: EngineWords;
}) {
  return (
    <div role="status">
      {isSignedOut(error) ? (
        <p className="px-4 pb-2 text-small text-fg-muted">{failureReason(error, words)}</p>
      ) : null}
    </div>
  );
}

/**
 * Whether a failed load never reached the engine: the host's `EngineNotAnswering`, or a failure
 * without a kind or a reason. Only then does the Inbox say the engine isn't answering; a source
 * the engine answered for with a refusal, such as the agent host's, says its own reason
 * (HAL-19190). The cards' buttons stay unavailable either way (`inbox.proposal-not-answering`).
 */
function engineSilent(error: unknown): boolean {
  if (error instanceof EngineNotAnswering) return true;
  const message = errorMessageFor(error, { title: loadFailed });
  return message.kind === "internal" || message.body.trim() === "";
}

/** How old the list is that a failed load left showing. */
export interface ListAge {
  /** When a load last succeeded in full; `undefined` before one has. */
  readonly updatedAt: Date | undefined;
  readonly now: () => Date;
}

/**
 * The line over a list that failed to load again. Signed out, the engine still answers, so it says
 * to sign in again, as a first load that fails does (HAL-13371). When the engine isn't answering,
 * the list is what it said last; when it answered with a refusal, the line gives that reason. Both
 * then say when the list was last updated (HAL-19190).
 *
 * @example
 * staleReason(new EngineNotAnswering(), words, age); // "The engine isn't answering. Showing what it said last. Last updated 10:42."
 */
function staleReason(error: unknown, words: EngineWords, age: ListAge): string {
  if (isSignedOut(error)) return failureReason(error, words);
  const reason = engineSilent(error)
    ? words.showingLast
    : `${failureReason(error, words)} Showing what was read last.`;
  const { updatedAt } = age;
  return updatedAt === undefined
    ? reason
    : `${reason} Last updated ${clockTime(updatedAt, age.now())}.`;
}

/**
 * The line over the list while its last load failed, as a Callout with **Try again**, so it is
 * noticed (design review HAL-18481, 8; `inbox.stale-callout`). The Callout is polite and always
 * there, so a screen reader reads the line once when it appears or changes, not on every
 * poll that fails the same way (HAL-13801 SO2). On a phone the page's heading is for screen
 * readers only, so the line takes the list's own top space rather than sitting against the top
 * bar (SO3).
 */
export function StaleLine({
  error,
  words,
  age,
  phone,
  onRetry,
}: {
  readonly error: unknown;
  readonly words: EngineWords;
  readonly age: ListAge;
  readonly phone: boolean;
  readonly onRetry: () => Promise<void>;
}) {
  // The Callout's own polite region holds the message alone, so Try again isn't read with every
  // change; it stays on the page while empty.
  return (
    <div className={error === undefined ? undefined : linePadding(phone)}>
      <Callout tone="info" announce="polite" action={{ label: "Try again", onClick: onRetry }}>
        {error === undefined ? "" : staleReason(error, words, age)}
      </Callout>
    </div>
  );
}

/** The stale line's padding: on a phone it takes the list's own top space (SO3). */
function linePadding(phone: boolean): string {
  return phone ? "px-4 pt-4 pb-2" : "px-4 pb-2";
}
