import { ListHeading } from "@halonicjs/studio-kit";
import { type ComponentType, lazy, Suspense, useId, useMemo } from "react";
import { type HomeCardContribution, homeSectionTitles } from "../points/home.ts";
import type { Registered } from "../points/point-store.ts";
import { loadView } from "../view.ts";
import type { WorkspaceContext } from "../workspace-context.ts";

/** What a Home card's view gets: the context of the feature that added the card. */
export interface HomeCardProps {
  readonly context: WorkspaceContext;
}

/** Props for {@link HomePage}. */
export interface HomePageProps {
  /** The cards features added, in Home's order: `shell.contributions.home.cards()`. */
  readonly cards: readonly Registered<HomeCardContribution>[];
  /** The context for a feature's card: `shell.services.contextFor(featureId, workspace)`. */
  readonly contextFor: (featureId: string) => WorkspaceContext;
}

/**
 * Home (design direction 3): the `h1` "Home", then a section for each card features added, in
 * Home's fixed order. A section whose feature hasn't landed isn't there, so Home never shows a
 * section with nothing behind it. Each section is a region named by its heading.
 *
 * @example
 * <HomePage cards={shell.contributions.home.cards()} contextFor={(id) => shell.services.contextFor(id, workspace)} />
 */
export function HomePage({ cards, contextFor }: HomePageProps) {
  return (
    <div className="mx-auto flex w-full max-w-page flex-col gap-2 px-6 py-6">
      <h1 tabIndex={-1} className="text-title outline-none">
        Home
      </h1>
      {cards.map((card) => (
        <HomeSectionRegion key={card.id} card={card} context={contextFor(card.featureId)} />
      ))}
    </div>
  );
}

function HomeSectionRegion({
  card,
  context,
}: {
  readonly card: Registered<HomeCardContribution>;
  readonly context: WorkspaceContext;
}) {
  const headingId = useId();
  const CardView = useCardView(card);
  return (
    <section aria-labelledby={headingId}>
      <ListHeading id={headingId} name={homeSectionTitles[card.id]} />
      <Suspense fallback={null}>
        <CardView context={context} />
      </Suspense>
    </section>
  );
}

/** The card's view, imported the first time the section shows; one import per card. */
function useCardView(card: HomeCardContribution): ComponentType<HomeCardProps> {
  return useMemo(
    () =>
      lazy(async () => ({
        default: await loadView<ComponentType<HomeCardProps>>(card),
      })),
    [card],
  );
}
