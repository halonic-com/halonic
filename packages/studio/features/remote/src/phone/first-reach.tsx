import {
  Button,
  RefreshIcon,
  useWaitedMs,
  WAITING_REASON_AFTER_MS,
  WaitingLine,
  WarningIcon,
} from "@halonicjs/studio-kit";
import { useId } from "react";
import type { ReachRoute } from "./connection-check.ts";
import { reachWords } from "./reach-words.ts";

/** A 48px text row, as a link looks: the phone's touch size for a quiet way out or a copy. */
export const linkRowClasses = [
  "inline-flex min-h-touch items-center rounded-xs px-2 text-body font-medium text-accent-text",
  "hover:underline focus-ring",
].join(" ");

/**
 * The phone's wait for a computer it hasn't reached yet (first-run-progress section 6): the kit's
 * waiting line, "Reaching Tim's laptop…" with the seconds, why it can take a moment from 10
 * seconds, and then Something wrong? as a 48px row. The row's room is kept from the start, so its
 * coming moves nothing; until then it is hidden, so neither Tab nor a screen reader finds it.
 */
export function ReachingLine({
  computer,
  since,
  onSomethingWrong,
}: {
  /** The computer's own name: "Tim's laptop". */
  readonly computer: string;
  /** When this reach started. */
  readonly since: Date;
  /** Opens Check this connection. */
  readonly onSomethingWrong: () => void;
}) {
  const waitedMs = useWaitedMs(since);
  const late = waitedMs >= WAITING_REASON_AFTER_MS;
  return (
    <div className="flex w-full max-w-empty flex-col items-center gap-2">
      <div className="w-full">
        <WaitingLine
          what={reachWords.reaching(computer)}
          waitedMs={waitedMs}
          reason={reachWords.reason}
          keepRoomFor={{ reasons: [reachWords.reason], actions: [] }}
        />
      </div>
      <button
        type="button"
        className={late ? linkRowClasses : `${linkRowClasses} invisible`}
        onClick={onSomethingWrong}
      >
        {reachWords.somethingWrong}
      </button>
    </div>
  );
}

/**
 * The first reach's give-up, at 30 seconds or when a try fails first: "{computer} isn't
 * answering", the header label's words for this state, the two likely causes for the way the
 * phone reaches it, Try again as the main button and Check this connection under it. Amber, as
 * every can't-reach state on the phone: nothing has failed on the computer that the phone knows of.
 * It's plain page content: the header's live region has already said the state.
 */
export function CantReachPanel({
  computer,
  route,
  onTryAgain,
  onCheck,
}: {
  readonly computer: string;
  readonly route: ReachRoute;
  readonly onTryAgain: () => void;
  readonly onCheck: () => void;
}) {
  const titleId = useId();
  const words = reachWords.cantReach;
  return (
    <section
      aria-labelledby={titleId}
      className="flex w-full max-w-empty flex-col gap-3 rounded-md bg-attention-soft px-4 py-3"
    >
      <div className="flex items-start gap-2">
        <span
          aria-hidden="true"
          className="mt-0.5 inline-grid size-icon-sm shrink-0 place-items-center text-attention *:size-full"
        >
          <WarningIcon />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <p id={titleId} className="text-body-strong text-fg">
            {words.title(computer)}
          </p>
          <p className="text-small text-fg">{words.causes[route]}</p>
        </div>
      </div>
      <Button variant="primary" size="touch" block icon={<RefreshIcon />} onClick={onTryAgain}>
        {words.tryAgain}
      </Button>
      <Button variant="secondary" size="touch" block onClick={onCheck}>
        {words.check}
      </Button>
    </section>
  );
}
