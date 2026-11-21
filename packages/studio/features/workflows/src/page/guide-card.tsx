import { Button } from "@halonicjs/studio-kit";
import { useEffect, useId, useState } from "react";
import type { WorkflowGuide, WorkflowGuideCard, WorkflowGuidePage, WorkflowRef } from "../api.ts";
import type { WorkflowView } from "./workflow-tabs.ts";

/**
 * The guide's card for this workflow now, read again whenever the guide says it may have changed;
 * `undefined` without a guide or a card.
 */
export function useGuideCard(
  guide: WorkflowGuide | undefined,
  workflow: WorkflowRef,
): WorkflowGuideCard | undefined {
  const [, setChanges] = useState(0);
  useEffect(() => guide?.subscribe(() => setChanges((count) => count + 1)), [guide]);
  return guide?.card(workflow);
}

/** Props for {@link GuideSlot}. */
export interface GuideSlotProps {
  readonly guide: WorkflowGuide | undefined;
  readonly workflow: WorkflowRef;
  /** The page's tab: the card shows only on Flow. */
  readonly view: WorkflowView;
  /** Whether another card is docked at the right, which leaves the guide's out. */
  readonly docked: boolean;
  readonly phone: boolean;
  readonly page: WorkflowGuidePage;
  /** Where this slot is: above the canvas, used on a phone, or at its right, used on the desktop. */
  readonly at: "top" | "right";
}

/**
 * Where the workflow page may show the guide's card (`workflows.guide-card`): on Flow, while no
 * other card is docked at the right. The page has two slots, and only the one for the layout
 * draws: `top` on a phone, `right` on the desktop.
 */
export function GuideSlot({ guide, workflow, view, docked, phone, page, at }: GuideSlotProps) {
  const card = useGuideCard(guide, workflow);
  if (card === undefined || view !== "flow" || docked || phone !== (at === "top")) {
    return null;
  }
  return <GuideCard card={card} page={page} phone={phone} />;
}

/** Props for {@link GuideCard}. */
export interface GuideCardProps {
  readonly card: WorkflowGuideCard;
  /** What the card's button may ask of the page. */
  readonly page: WorkflowGuidePage;
  /** On a phone the card sits above the canvas, full width; on the desktop at the right. */
  readonly phone: boolean;
}

/**
 * Another feature's guide card on the workflow's page (`workflows.guide-card`), such as the first
 * run's: a region named by its title, the lines, and one primary button. It isn't a dialog and has
 * no ✕, so the canvas stays usable beside it.
 */
export function GuideCard({ card, page, phone }: GuideCardProps) {
  const headingId = useId();
  return (
    <aside
      aria-labelledby={headingId}
      className={phone ? classes.phone : classes.desktop}
      data-guide-card=""
    >
      <h2 id={headingId} className="text-body-strong">
        {card.title}
      </h2>
      {card.lines.map((line) => (
        <p key={`${line.label ?? ""}${line.text}`} className="text-body text-fg-muted">
          {line.label === undefined ? null : (
            <span className="text-body-strong text-fg">{line.label} </span>
          )}
          {line.text}
        </p>
      ))}
      <div>
        <Button variant="primary" size="sm" onClick={() => card.action.run(page)}>
          {card.action.label}
        </Button>
      </div>
    </aside>
  );
}

const classes = {
  desktop:
    "flex w-80 max-w-full shrink-0 flex-col gap-3 overflow-auto border-s border-border bg-surface-raised p-6",
  phone: "flex flex-col gap-3 border-b border-border bg-surface-raised px-4 py-3",
} as const;
