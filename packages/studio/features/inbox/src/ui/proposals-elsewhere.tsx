import { proposalsElsewhere } from "../plain/proposal-text.ts";

/**
 * Under Needs you in a window that lists no run proposals, a served Studio or a phone, which
 * reach no agent host (HAL-15986): where they show instead, so a proposal made on the computer
 * isn't missed.
 */
export function ProposalsElsewhere() {
  const { before, command, after } = proposalsElsewhere;
  return (
    <p className="px-4 pt-2 text-small text-fg-muted">
      {before} <code className="font-mono text-code">{command}</code> {after}
    </p>
  );
}
