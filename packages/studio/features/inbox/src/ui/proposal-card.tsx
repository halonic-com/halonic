import { useEffect, useId, useRef } from "react";
import type { ProposalItem } from "../proposal-items.ts";
import { CardHeader } from "./card-parts.tsx";
import { itemTitle } from "./inbox-row.tsx";

/** What {@link ProposalCard} shows. */
export interface ProposalCardProps {
  readonly item: ProposalItem;
  /** "Finished 2 h ago", as the row's meta. */
  readonly ended: string;
  readonly startedBy?: string | undefined;
  readonly onOpenRun?: ((runId: string) => void) | undefined;
}

/**
 * A run proposal opened from Needs you. For now only its header, as the row reads, with **Open
 * run**; the changes with **Accept** and **Reject** are the next part of HAL-10916 (Q3 to Q7).
 */
export function ProposalCard({ item, ended, startedBy, onOpenRun }: ProposalCardProps) {
  const titleId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus({ preventScroll: true }), []);
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-4">
      <CardHeader
        titleId={titleId}
        title={itemTitle(item)}
        heading={heading}
        since={ended}
        startedBy={startedBy}
        onOpenRun={onOpenRun === undefined ? undefined : () => onOpenRun(item.runId)}
      />
    </section>
  );
}
