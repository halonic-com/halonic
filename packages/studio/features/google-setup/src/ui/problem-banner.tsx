import { Callout } from "@halonicjs/studio-kit";
import type { ConnectorProblem } from "../connector-problem.ts";

/** Props for {@link ProblemBanner}. */
export interface ProblemBannerProps {
  readonly problem: ConnectorProblem;
  /** Opens the step the button names. Left out on a phone, which has no buttons. */
  readonly onAction?: () => void;
}

/**
 * What Google refused, at the top of the item, with the one button that fixes it. It is plain
 * page content, so it doesn't take focus when it appears while you are on the page (UX
 * checklists section 5).
 */
export function ProblemBanner({ problem, onAction }: ProblemBannerProps) {
  return (
    <Callout
      tone="attention"
      {...(onAction === undefined ? {} : { action: { label: problem.action, onClick: onAction } })}
    >
      {problem.lead === undefined ? null : <strong className="block">{problem.lead}</strong>}
      {problem.text}
    </Callout>
  );
}
