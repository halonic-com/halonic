import { Callout, Disclosure } from "@halonicjs/studio-kit";
import type { ConnectorProblem } from "../connector-problem.ts";
import { WhyNotPublish } from "./consent-body.tsx";

/** Props for {@link ProblemBanner}. */
export interface ProblemBannerProps {
  readonly problem: ConnectorProblem;
  /** Opens the step the button names. Left out on a phone, which has no buttons. */
  readonly onAction?: () => void;
  /**
   * **Publish with my own pages**, from the "Why not publish?" folded under the weekly end
   * (design 5.2 row 3). Left out on a phone, where it isn't shown.
   */
  readonly onPublish?: () => void;
}

/**
 * What Google refused, at the top of the item, with the one button that fixes it. It is plain
 * page content, so it doesn't take focus when it appears while you are on the page (UX
 * checklists section 5).
 */
export function ProblemBanner({ problem, onAction, onPublish }: ProblemBannerProps) {
  return (
    <>
      <Callout
        tone="attention"
        {...(onAction === undefined
          ? {}
          : { action: { label: problem.action, onClick: onAction } })}
      >
        {problem.text}
      </Callout>
      {problem.weekly === "ended" && onPublish !== undefined ? (
        <Disclosure summary="Why not publish?">
          <WhyNotPublish onPublish={onPublish} />
        </Disclosure>
      ) : null}
    </>
  );
}
