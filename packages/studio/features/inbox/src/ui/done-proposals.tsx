// The Done heading (flow-inbox 2.2, HAL-11945 Q10): run proposals settled in the last 30 days,
// collapsed under the Inbox's list, each opening a read-only summary of what was decided.

import { Disclosure, inlineLinkClasses, List } from "@halonicjs/studio-kit";
import { useEffect, useId, useRef } from "react";
import {
  changeLine,
  doneOutcome,
  notReviewed,
  proposalFacts,
  seeRunText,
} from "../plain/proposal-text.ts";
import type { ProposalFile, ProposalItem } from "../proposal-items.ts";
import { cardBodyClasses, cardClasses } from "./card-parts.tsx";
import { itemTitle } from "./inbox-row.tsx";
import type { RunFacts } from "./run-facts.ts";

/** What {@link DoneSection} shows. */
export interface DoneSectionProps {
  /** The done proposals, the one settled last first. */
  readonly done: readonly ProposalItem[];
  /** The key of the open item, so its row is marked as the current one. */
  readonly current: string | undefined;
  readonly onOpen: (item: ProposalItem) => void;
}

/**
 * **Done**, collapsed, with one row per done proposal: its title, and what it came to in place of
 * the meta. No count, here or in any badge, and nothing at all while there is none.
 */
export function DoneSection({ done, current, onOpen }: DoneSectionProps) {
  if (done.length === 0) return null;
  return (
    <div className="pt-2">
      <Disclosure summary="Done">
        <List
          label="Done"
          rows={done.map((item) => ({
            id: item.key,
            title: itemTitle(item),
            meta: doneOutcome(item.files),
            wrapTitle: true,
          }))}
          onOpen={(key) => {
            const item = done.find((shown) => shown.key === key);
            if (item !== undefined) onOpen(item);
          }}
          {...(current === undefined ? {} : { current })}
        />
      </Disclosure>
    </div>
  );
}

/** What {@link DoneProposalCard} shows. */
export interface DoneProposalCardProps {
  readonly item: ProposalItem;
  readonly now: Date;
  /** The run's workflow and starter, from the Runs list; `undefined` while it doesn't have the run. */
  readonly facts: RunFacts | undefined;
  readonly onOpenRun?: ((runId: string) => void) | undefined;
}

const fileWords: Readonly<Record<ProposalFile["decision"], string>> = {
  accepted: "Accepted",
  rejected: "Rejected",
  undecided: notReviewed,
  "not-applicable": "Can't be written",
};

/**
 * A done proposal opened from the Done heading (Q10): its title, the run's facts, what it came to
 * and what was decided on each change, with **See run 01JD8Q ›**. Read-only: no diff, no buttons.
 */
export function DoneProposalCard({ item, now, facts, onOpenRun }: DoneProposalCardProps) {
  const titleId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus({ preventScroll: true }), []);
  return (
    <section aria-labelledby={titleId} className={cardClasses}>
      <div className={cardBodyClasses}>
        <header>
          <h2
            id={titleId}
            ref={heading}
            tabIndex={-1}
            className="focus-ring text-title text-fg wrap-break-word"
          >
            {itemTitle(item)}
          </h2>
          <p className="text-small text-fg-muted">{proposalFacts(item, now, facts)}</p>
        </header>
        <p className="text-body text-fg">{doneOutcome(item.files)}</p>
        <ul className="flex flex-col gap-2">
          {item.files.map((file) => (
            <li key={file.path} className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="min-w-0 flex-1 text-body wrap-break-word">{changeLine(file)}</span>
              <span className="text-small text-fg-muted">{fileWords[file.decision]}</span>
            </li>
          ))}
        </ul>
        {onOpenRun === undefined ? null : (
          <p className="text-body">
            <button
              type="button"
              className={inlineLinkClasses}
              onClick={() => onOpenRun(item.runId)}
            >
              {seeRunText(item.runId)}
              <span aria-hidden="true"> ›</span>
            </button>
          </p>
        )}
      </div>
    </section>
  );
}
