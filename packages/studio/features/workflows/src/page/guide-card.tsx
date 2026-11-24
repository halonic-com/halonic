import { Button, ChevronRightIcon, RefreshIcon } from "@halonicjs/studio-kit";
import { type RefObject, useEffect, useId, useState } from "react";
import type {
  WorkflowGuide,
  WorkflowGuideCard,
  WorkflowGuideLine,
  WorkflowGuidePage,
  WorkflowRef,
} from "../api.ts";
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
 * draws: `top` on a phone, `right` on the desktop. The `right` slot comes before the canvas in the
 * DOM and is drawn after it, so Tab reaches the card's one button before the canvas's cards
 * (`workflows.page.guide-card-first`).
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
 * run's, drawn as sheet 05 has it: a card with its own border and corners, as tall as its content,
 * its title over a divider, the lines (a labelled one as a quote in an inset box, its label small
 * above the text), and one full-width primary button with a ›, or with the refresh mark when it
 * runs something again. It isn't a dialog and has no ✕, so the canvas stays usable beside it.
 */
export function GuideCard({ card, page, phone, button }: GuideCardProps) {
  const headingId = useId();
  const again = card.action.again === true;
  return (
    <aside
      aria-labelledby={headingId}
      className={phone ? classes.phone : classes.desktop}
      data-guide-card=""
    >
      <h2 id={headingId} className="border-b border-border px-4 py-3 text-section wrap-anywhere">
        {card.title}
      </h2>
      <div className="flex flex-col gap-4 p-4">
        {card.lines.map((line, index) => (
          // Two lines may read the same, so the place keeps the key unique.
          <GuideLine key={`${index}:${line.label ?? ""}${line.text}`} line={line} />
        ))}
        <Button
          ref={button ?? null}
          variant="primary"
          size="lg"
          block
          icon={again ? <RefreshIcon /> : undefined}
          onClick={() => card.action.run(page)}
        >
          {card.action.label}
          {again ? null : (
            <span className={chevron} aria-hidden="true">
              <ChevronRightIcon />
            </span>
          )}
        </Button>
      </div>
    </aside>
  );
}

/** A plain line, or a labelled one ("The email") as a quote: an inset box with a bar at its start. */
function GuideLine({ line }: { readonly line: WorkflowGuideLine }) {
  if (line.label === undefined) {
    return <p className="text-body text-fg-muted">{line.text}</p>;
  }
  return (
    <div className="rounded-e-sm border-s-2 border-border-strong bg-surface-subtle px-3 py-2">
      <p className="mb-1 text-caption text-fg-muted">{line.label}</p>
      <p className="text-body text-fg">{line.text}</p>
    </div>
  );
}

const chevron = "inline-grid size-icon-sm shrink-0 place-items-center *:size-full";

const classes = {
  desktop:
    "order-last m-4 flex w-80 max-w-full shrink-0 flex-col self-start overflow-hidden rounded-md border border-border bg-surface",
  phone: "mx-4 my-3 flex flex-col overflow-hidden rounded-md border border-border bg-surface",
} as const;
