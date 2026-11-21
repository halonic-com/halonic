import { Button } from "@halonicjs/studio-kit";
import { type RefObject, useEffect, useId, useState } from "react";
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
  useEffect(() => {
    if (guide === undefined) return;
    const changed = () => setChanges((count) => count + 1);
    const stop = guide.subscribe(changed);
    // A change between the first read and this subscription would go unseen, so read once more.
    // (`useSyncExternalStore` would need `card` to return the same object until it changes.)
    changed();
    return stop;
  }, [guide]);
  return cardOf(guide, workflow);
}

/** The guide's card, or none when the guide fails to give one: its fault mustn't break the page. */
function cardOf(
  guide: WorkflowGuide | undefined,
  workflow: WorkflowRef,
): WorkflowGuideCard | undefined {
  if (guide === undefined) return undefined;
  try {
    return guide.card(workflow);
  } catch (error) {
    console.error(`The guide couldn't give a card for "${workflow.id}".`, error);
    return undefined;
  }
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
  /** The card's button, which takes focus back when the Run form it opened closes. */
  readonly button: RefObject<HTMLButtonElement | null>;
}

/**
 * Where the workflow page may show the guide's card (`workflows.page.guide-card`): on Flow, while no
 * other card is docked at the right. The page has two slots, and only the one for the layout
 * draws: `top` on a phone, `right` on the desktop.
 */
export function GuideSlot({
  guide,
  workflow,
  view,
  docked,
  phone,
  page,
  at,
  button,
}: GuideSlotProps) {
  const card = useGuideCard(guide, workflow);
  if (card === undefined || view !== "flow" || docked || phone !== (at === "top")) {
    return null;
  }
  return <GuideCard card={card} page={page} phone={phone} button={button} />;
}

/** Props for {@link GuideCard}. */
export interface GuideCardProps {
  readonly card: WorkflowGuideCard;
  /** What the card's button may ask of the page. */
  readonly page: WorkflowGuidePage;
  /** On a phone the card sits above the canvas, full width; on the desktop at the right. */
  readonly phone: boolean;
  /** Where the page keeps the card's button, to give it focus back. */
  readonly button?: RefObject<HTMLButtonElement | null> | undefined;
}

/**
 * Another feature's guide card on the workflow's page (`workflows.page.guide-card`), such as the first
 * run's: a region named by its title, the lines, and one primary button. It isn't a dialog and has
 * no ✕, so the canvas stays usable beside it.
 */
export function GuideCard({ card, page, phone, button }: GuideCardProps) {
  const headingId = useId();
  return (
    <aside
      aria-labelledby={headingId}
      className={phone ? classes.phone : classes.desktop}
      data-guide-card=""
    >
      <h2 id={headingId} className="text-title wrap-anywhere">
        {card.title}
      </h2>
      {card.lines.map((line, index) => (
        // Two lines may read the same, so the place keeps the key unique.
        <p key={`${index}:${line.label ?? ""}${line.text}`} className="text-body text-fg-muted">
          {line.label === undefined ? null : (
            <span className="text-body-strong text-fg">{line.label} </span>
          )}
          {line.text}
        </p>
      ))}
      <div>
        <Button
          ref={button ?? null}
          variant="primary"
          size="sm"
          onClick={() => card.action.run(page)}
        >
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
