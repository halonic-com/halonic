import { inlineLinkClasses } from "@halonicjs/studio-kit";
import {
  copyDetailsWords,
  detailsOf,
  EngineNotAnswering,
  type EngineWords,
  errorReasonFor,
  useCopyDetails,
} from "@halonicjs/studio-shell";

/**
 * Why runs couldn't load or a run didn't start (states R17 and R21, microcopy 22 F13). Only a host
 * that says the engine can't be reached ({@link EngineNotAnswering}) gets "isn't answering", in the
 * words for where Studio runs: the Runs list and the run logs are read from the workspace's files,
 * so any other failure isn't the engine's. That failure gives a kinded error's own reason, else
 * "Halonic ran into a problem it can't explain yet."
 */
export function loadFailureReason(error: unknown, engine: EngineWords, afterColon = false): string {
  const reason = error instanceof EngineNotAnswering ? engine.notAnswering : errorReasonFor(error);
  return afterColon ? lowerAfterColon(reason) : reason;
}

/**
 * Any reason after the colon, the engine's or the host's own: a sentence that starts
 * with a common word reads on in lower case ("The desktop shell gave no answer …" reads "the
 * desktop shell …"). Any other first word may be a name, such as Halonic or an agent called
 * Writer, and keeps its capital.
 */
function lowerAfterColon(reason: string): string {
  return leadingCommonWord.test(reason) ? reason.charAt(0).toLowerCase() + reason.slice(1) : reason;
}

/** The first words a reason may start with that are never a name. */
const leadingCommonWord =
  /^(?:The|A|An|This|That|These|Those|It|Its|There|No|Nothing|Your|You|Some|Something)\b/u;

/** Props for {@link FailureReason}. */
export interface FailureReasonProps {
  /** What failed, such as "Couldn't load runs": the first line Copy details puts on the clipboard. */
  readonly what: string;
  readonly error: unknown;
  readonly engine: EngineWords;
  /** The reason follows a colon, as in "Couldn't start the run: the engine isn't answering." */
  readonly afterColon?: boolean;
}

/**
 * The reason of {@link loadFailureReason}, then **Copy details** when the failure has no reason of
 * its own to show (F13): the error itself goes only to the clipboard, never on screen.
 */
export function FailureReason({ what, error, engine, afterColon = false }: FailureReasonProps) {
  const copyDetails = useCopyDetails();
  const reason = loadFailureReason(error, engine, afterColon);
  const unexplained = !(error instanceof EngineNotAnswering) && errorReasonFor(error, "") === "";
  if (!unexplained) return reason;
  return (
    <>
      {reason}{" "}
      <button
        type="button"
        className={inlineLinkClasses}
        onClick={() => void copyDetails(detailsOf(what, error))}
      >
        {copyDetailsWords.label}
      </button>
    </>
  );
}

/**
 * The line over what a page kept when a later read failed: the host's "isn't answering. Showing
 * what it said last." when the engine can't be reached, else what couldn't be refreshed and why.
 */
export function RefreshFailedLine({
  what,
  error,
  engine,
}: {
  readonly what: string;
  readonly error: unknown;
  readonly engine: EngineWords;
}) {
  return (
    <p className="text-small text-fg-muted">
      {error instanceof EngineNotAnswering ? (
        engine.showingLast
      ) : (
        <>
          {what}. <FailureReason what={what} error={error} engine={engine} />
        </>
      )}
    </p>
  );
}
