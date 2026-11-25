import { StatusChip } from "@halonicjs/studio-kit";
import type { PlaceSignal } from "../points/frame.ts";

/**
 * A place's number as a count chip: the plain number for a `count`, or "! 2" in the warning
 * colour for `problems` (HAL-17510 flows, Choice P1). A screen reader hears the signal's words,
 * such as "2 problems", not the mark.
 */
export function SignalCount({ signal }: { readonly signal: PlaceSignal }) {
  const problems = signal.mark === "problems";
  return (
    <StatusChip tone={problems ? "warning" : "accent"} shape="count" name={signal.spoken}>
      {problems ? `! ${signal.value}` : signal.value}
    </StatusChip>
  );
}
