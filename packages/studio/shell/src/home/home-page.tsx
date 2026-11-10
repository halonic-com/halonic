import { useCallback, useState } from "react";
import type { HomeCardContribution } from "../points/home.ts";
import type { Registered } from "../points/point-store.ts";
import type { WorkspaceContext } from "../workspace-context.ts";
import { HomeLoadingReport } from "./home-loading.tsx";
import { HomeSectionRegion } from "./home-section.tsx";

export type { HomeCardProps } from "./home-section.tsx";

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
 * section with nothing behind it. Each section loads and fails on its own; while any shows its
 * skeleton, screen readers hear "Loading Home" once.
 *
 * @example
 * <HomePage cards={shell.contributions.home.cards()} contextFor={(id) => shell.services.contextFor(id, workspace)} />
 */
export function HomePage({ cards, contextFor }: HomePageProps) {
  const [loadingSections, setLoadingSections] = useState(0);
  const report = useCallback((change: 1 | -1) => setLoadingSections((count) => count + change), []);

  return (
    <div className="mx-auto flex w-full max-w-page flex-col gap-2 px-6 py-6">
      <h1 tabIndex={-1} className="text-title outline-none">
        Home
      </h1>
      {/* There from the start, so screen readers announce the text when it arrives. */}
      <span role="status" className="sr-only">
        {loadingSections > 0 ? "Loading Home" : ""}
      </span>
      <HomeLoadingReport value={report}>
        {cards.map((card) => (
          <HomeSectionRegion key={card.id} card={card} context={contextFor(card.featureId)} />
        ))}
      </HomeLoadingReport>
    </div>
  );
}
