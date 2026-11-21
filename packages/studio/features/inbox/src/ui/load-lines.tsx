import { type EngineWords, errorMessageFor } from "@halonicjs/studio-shell";

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
 * The line over a list that failed to load again. Signed out, the engine still answers, so it says
 * to sign in again, as a first load that fails does (HAL-13371); otherwise it isn't answering and
 * the list is what it said last.
 */
function staleReason(error: unknown, words: EngineWords): string {
  return isSignedOut(error) ? failureReason(error, words) : words.showingLast;
}

/**
 * The line over the list while its last load failed, in a polite status that is always there, so
 * a screen reader reads the line once when it appears or changes, not on every poll that fails
 * the same way (HAL-13801 SO2). On a phone the page's heading is for screen readers only, so the
 * line takes the list's own top space rather than sitting against the top bar (SO3).
 */
export function StaleLine({
  error,
  words,
  phone,
}: {
  readonly error: unknown;
  readonly words: EngineWords;
  readonly phone: boolean;
}) {
  return (
    <div role="status">
      {error === undefined ? null : (
        <p className={`px-4 pb-2 text-small text-fg-muted ${phone ? "pt-4" : ""}`}>
          {staleReason(error, words)}
        </p>
      )}
    </div>
  );
}
