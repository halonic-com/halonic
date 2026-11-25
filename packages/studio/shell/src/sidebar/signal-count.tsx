import { StatusChip, WarningIcon } from "@halonicjs/studio-kit";
import type { PlaceSignal } from "../points/frame.ts";

/**
 * A place's number as a count chip: the plain number for a `count`, or "⚠ 2" in amber, the kit's
 * "have a look" `attention`, for `problems` (HAL-17510 flows, Choice P1; HAL-17515 S0 and the
 * wording's Shared row). A screen reader hears the signal's words, such as "2 problems", not the
 * mark.
 */
export function SignalCount({ signal }: { readonly signal: PlaceSignal }) {
  const problems = signal.mark === "problems";
  return (
    <StatusChip tone={problems ? "attention" : "accent"} shape="count" name={signal.spoken}>
      {problems ? (
        <span className="inline-flex items-center gap-0.5">
          <span aria-hidden="true" className="inline-grid size-3 *:size-full">
            <WarningIcon />
          </span>
          {signal.value}
        </span>
      ) : (
        signal.value
      )}
    </StatusChip>
  );
}
