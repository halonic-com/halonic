import { BackIcon, Button, CloseIcon } from "@halonicjs/studio-kit";
import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useRef,
} from "react";
import type { CloseStack } from "../close-stack/close-stack.ts";
import { useCardFocus } from "./card-focus.ts";
import {
  backToCard,
  type CardStack,
  closeTopCard,
  dockedCardCoversPanel,
  type StackedCard,
  shownCards,
  topCardName,
} from "./card-stack.ts";

/** Props for {@link StackedCards}. */
export interface StackedCardsProps {
  /** The item's own path, its name last: `["Acme Mail", "Writer"]`. */
  readonly itemPath: readonly string[];
  /** The page's cards, the bottom one first (`shell.card-stack`). */
  readonly stack: CardStack;
  /** Sets the page's cards; the stacked cards call it to go back or close. */
  readonly onChange: (stack: CardStack) => void;
  /** The window's close stack: Esc closes the top card. */
  readonly closeStack: CloseStack;
  /** The panel's width, so a docked card covers a panel under 720px. */
  readonly panelWidth: number;
  /** Draws a card's body under its header. */
  readonly renderCard: (card: StackedCard) => ReactNode;
  /** The view the cards open over. */
  readonly children: ReactNode;
}

/**
 * How the stack sits over the view: no cards; a docked card alone at the right; a docked card alone
 * covering a panel under 720px; or full cards over the dimmed view.
 */
type StackLook = "none" | "docked" | "docked-covering" | "full";

function stackLook(stack: CardStack, panelWidth: number): StackLook {
  const [bottom] = stack;
  if (bottom === undefined) {
    return "none";
  }
  if (stack.length > 1 || bottom.docked !== true) {
    return "full";
  }
  return dockedCardCoversPanel(panelWidth) ? "docked-covering" : "docked";
}

/**
 * An item page's stacked cards drawn over its view (component specs 16, K6; VK T6-F3, F4): the top
 * card with its breadcrumb, ← and ✕, and at most two cards behind it as bands, each 10px higher, 12px
 * narrower on each side and one shade darker. Full cards dim the view with `--stack-scrim`, which
 * makes it inert; a click there closes the top card. A docked card alone sits at the right, 480px
 * wide, over a view that stays usable and undimmed; under 720px it covers the panel. Nothing moves:
 * a card is in place in the next frame.
 *
 * Esc, ← and the scrim close the top card, a breadcrumb part or a band goes back to its level, and
 * ✕ closes every card. Opening a card focuses its title, named with its path; closing one gives the
 * focus back to what opened it (a11y 6.5).
 *
 * @example
 * <StackedCards itemPath={["Acme Mail", "Writer"]} stack={cards} onChange={setCards}
 *   closeStack={shell.closeStack} panelWidth={width} renderCard={(card) => <TaskCard card={card} />}>
 *   <AgentMap onOpen={(card) => setCards(openCard(cards, card))} />
 * </StackedCards>
 */
export function StackedCards(props: StackedCardsProps) {
  const { itemPath, stack, onChange, closeStack, panelWidth, renderCard, children } = props;
  const layer = useRef<HTMLDivElement>(null);
  const look = stackLook(stack, panelWidth);
  useCardFocus(stack, layer);
  useCloseLayer(stack, look, closeStack, layer, onChange);

  const shown = shownCards(stack);
  const top = shown.at(-1);
  const goBackTo = (level: number) => onChange(backToCard(stack, level));
  return (
    <div ref={layer} className="relative h-full min-h-0">
      <div className="h-full" inert={look === "full" || look === "docked-covering"}>
        {children}
      </div>
      {look === "full" ? (
        // For the pointer only: the keyboard goes back with Esc, ← or the breadcrumb.
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-(--stack-scrim)"
          onClick={() => onChange(closeTopCard(stack))}
        />
      ) : null}
      {shown.slice(0, -1).map((card, index) => {
        const level = stack.length - shown.length + index;
        return (
          <CardBand
            key={card.key}
            card={card}
            depth={shown.length - 1 - index}
            behind={shown.length - 1}
            onGoBack={() => goBackTo(level)}
          />
        );
      })}
      {top === undefined || look === "none" ? null : (
        <TopCard
          card={top}
          look={look}
          behind={shown.length - 1}
          itemPath={itemPath}
          stack={stack}
          onGoBack={goBackTo}
        >
          {renderCard(top)}
        </TopCard>
      )}
    </div>
  );
}

/**
 * Registers the top card with the window's close stack while there is one, as a `stacked-card`, or
 * a `docked-card` for a docked card alone. Each stack registers anew, since the close stack lets a
 * layer go once it has closed it. It counts only while its page is shown, since the last five
 * tabs' pages stay mounted.
 */
function useCloseLayer(
  stack: CardStack,
  look: StackLook,
  closeStack: CloseStack,
  layer: RefObject<HTMLElement | null>,
  onChange: (stack: CardStack) => void,
): void {
  useEffect(() => {
    if (look === "none") {
      return;
    }
    return closeStack.open({
      kind: look === "full" ? "stacked-card" : "docked-card",
      close: () => {
        onChange(closeTopCard(stack));
        return true;
      },
      isActive: () => layer.current?.closest("[hidden], [inert]") === null,
    });
  }, [stack, look, closeStack, layer, onChange]);
}

/** Where the stack sits in the panel, 16px in from its edges, room left above for the bands. */
const stackGap = 16;

/** The position of a card `depth` steps behind the top one, with `behind` cards behind the top. */
function cardPlace(depth: number, behind: number, fullWidth: boolean): CSSProperties {
  const side = fullWidth ? `${stackGap}px` : `calc(${stackGap}px + var(--stack-inset) * ${depth})`;
  return {
    top: `calc(${stackGap}px + var(--stack-peek) * ${behind - depth})`,
    bottom: `${stackGap}px`,
    insetInline: side,
  };
}

interface CardBandProps {
  readonly card: StackedCard;
  readonly depth: number;
  /** How many cards are behind the top one, so the band furthest back sits highest. */
  readonly behind: number;
  readonly onGoBack: () => void;
}

/**
 * A card behind the top one: only its 10px band shows above the top card, on `--stack-shade-1` one
 * step back and `--stack-shade-2` further, with no shadow. A docked card behind stays full width.
 * A click goes back to it; the keyboard has the breadcrumb, so it's hidden from screen readers.
 */
function CardBand({ card, depth, behind, onGoBack }: CardBandProps) {
  const shade = depth === 1 ? "bg-(--stack-shade-1)" : "bg-(--stack-shade-2)";
  return (
    <div
      aria-hidden="true"
      className={`absolute rounded-md border border-border ${shade}`}
      style={cardPlace(depth, behind, card.docked === true)}
      onClick={onGoBack}
    />
  );
}

interface TopCardProps {
  readonly card: StackedCard;
  readonly look: Exclude<StackLook, "none">;
  readonly behind: number;
  readonly itemPath: readonly string[];
  readonly stack: CardStack;
  readonly onGoBack: (level: number) => void;
  readonly children: ReactNode;
}

/** The card on top: `surface-raised` with `shadow-2`, its header, then the body the feature draws. */
function TopCard({ card, look, behind, itemPath, stack, onGoBack, children }: TopCardProps) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className={topCardClasses[look]}
      style={look === "full" ? cardPlace(0, behind, false) : undefined}
    >
      <header className="flex flex-col gap-1 border-b border-border px-4 pt-3 pb-3">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            icon={<BackIcon />}
            label="Back"
            onClick={() => onGoBack(stack.length - 2)}
          />
          <CardBreadcrumb itemPath={itemPath} stack={stack} onGoBack={onGoBack} />
          <Button
            variant="ghost"
            size="sm"
            icon={<CloseIcon />}
            label={closeLabel(stack)}
            onClick={() => onGoBack(-1)}
          />
        </div>
        <h2
          id={titleId}
          data-top-card-title=""
          tabIndex={-1}
          aria-label={topCardName(itemPath, stack)}
          className="truncate rounded-xs text-heading text-fg focus-ring"
        >
          {card.title}
        </h2>
      </header>
      <div key={card.key} className="min-h-0 flex-1 overflow-y-auto">
        {children}
      </div>
    </section>
  );
}

/**
 * ✕ closes every card, ← only the top one: with more than one card open, ✕ says so, or a screen
 * reader would hear two controls that do different things under one name (Sofia, HAL-1290).
 */
function closeLabel(stack: CardStack): string {
  return stack.length > 1 ? "Close all cards" : "Close";
}

/**
 * A full card floats inside the panel with a radius. A docked card takes the right 480px of the
 * panel, full height, its edge a border and a soft shadow, or the whole panel under 720px.
 */
const topCardClasses: Readonly<Record<Exclude<StackLook, "none">, string>> = {
  full: "absolute flex flex-col rounded-md border border-border bg-surface-raised shadow-2",
  docked:
    "absolute inset-y-0 end-0 flex w-120 max-w-full flex-col border-s border-border bg-surface-raised shadow-2",
  "docked-covering": "absolute inset-0 flex flex-col bg-surface-raised",
};

interface CardBreadcrumbProps {
  readonly itemPath: readonly string[];
  readonly stack: CardStack;
  readonly onGoBack: (level: number) => void;
}

/**
 * The breadcrumb, the keyboard's way back (a11y 6.5): the item's path, then each card. The item's
 * own name closes every card and each card below the top goes back to it. The parts above the item
 * (its hub) are plain text: they are another page, not a level of this stack.
 */
function CardBreadcrumb({ itemPath, stack, onGoBack }: CardBreadcrumbProps) {
  const parts = [
    ...itemPath.map((title, index) => ({
      title,
      level: index === itemPath.length - 1 ? -1 : undefined,
    })),
    ...stack.map((card, level) => ({ title: card.title, level })),
  ];
  const current = parts.length - 1;
  const goBackTo = (level: number | undefined) =>
    level === undefined ? undefined : () => onGoBack(level);
  return (
    <nav aria-label="Card path" className="min-w-0 flex-1">
      <ol className="flex min-w-0 items-center gap-1.5 text-small">
        {parts.map((part, index) => (
          // A title can repeat (two steps named "check"), so the place in the path is the key.
          <li key={index} className="flex min-w-0 items-center gap-1.5">
            <BreadcrumbPart
              title={part.title}
              current={index === current}
              onGoBack={goBackTo(part.level)}
            />
            {index < current ? (
              <span aria-hidden="true" className="shrink-0 text-fg-muted">
                ›
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </nav>
  );
}

interface BreadcrumbPartProps {
  readonly title: string;
  readonly current: boolean;
  readonly onGoBack: (() => void) | undefined;
}

function BreadcrumbPart({ title, current, onGoBack }: BreadcrumbPartProps) {
  if (current) {
    return (
      <span aria-current="location" className="truncate text-fg">
        {title}
      </span>
    );
  }
  if (onGoBack === undefined) {
    return <span className="truncate text-fg-muted">{title}</span>;
  }
  return (
    <button type="button" className={partClasses} onClick={onGoBack}>
      {title}
    </button>
  );
}

const partClasses =
  "min-w-0 truncate rounded-xs text-fg-muted underline-offset-2 hover:text-fg hover:underline focus-ring";
