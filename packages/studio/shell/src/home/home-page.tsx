import { usePresentation } from "@halonicjs/studio-kit";
import { useCallback, useState, useSyncExternalStore } from "react";
import type { HomeCardContribution } from "../points/home.ts";
import type { Registered } from "../points/point-store.ts";
import type { WorkspaceContext } from "../workspace-context.ts";
import { HomeErrorReasons, HomeErrorReport } from "./home-errors.ts";
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
 * skeleton, screen readers hear "Loading Home" once. When sections fail, they hear each reason
 * once, so an engine that isn't answering is said once, not once per section. The reasons take
 * the place of "Loading Home" while other sections still load.
 *
 * On a phone (PH 2.1, T2-F12) the top bar already shows "Home", so the `h1` is for screen readers
 * only, and the sections run edge to edge as headings over flush lists, 8px apart.
 *
 * @example
 * <HomePage cards={shell.contributions.home.cards()} contextFor={(id) => shell.services.contextFor(id, workspace)} />
 */
export function HomePage({ cards, contextFor }: HomePageProps) {
  const phone = usePresentation() === "phone";
  const [loadingSections, setLoadingSections] = useState(0);
  const reportLoading = useCallback(
    (change: 1 | -1) => setLoadingSections((count) => count + change),
    [],
  );
  const [errors] = useState(() => new HomeErrorReasons());

  return (
    <div
      className={
        phone
          ? "flex w-full flex-col gap-2 pb-4"
          : "mx-auto flex w-full max-w-page flex-col gap-2 px-6 py-6"
      }
    >
      <h1 tabIndex={-1} className={phone ? "sr-only" : "text-title outline-none"}>
        Home
      </h1>
      <HomeStatus errors={errors} loadingSections={loadingSections} />
      <HomeLoadingReport value={reportLoading}>
        <HomeErrorReport value={errors.report}>
          {cards.map((card) => (
            <HomeSectionRegion key={card.id} card={card} context={contextFor(card.featureId)} />
          ))}
        </HomeErrorReport>
      </HomeLoadingReport>
    </div>
  );
}

/**
 * The page's one status: why sections failed, each reason once, else "Loading Home" while any
 * section shows its skeleton. A reason that stays the same isn't said again when another section
 * fails for it too. There from the start, so screen readers announce the text when it arrives.
 */
function HomeStatus({
  errors,
  loadingSections,
}: {
  readonly errors: HomeErrorReasons;
  readonly loadingSections: number;
}) {
  const reasons = useSyncExternalStore(errors.subscribe, errors.reasons);
  let text = "";
  if (reasons.length > 0) {
    text = reasons.map(asSentence).join(" ");
  } else if (loadingSections > 0) {
    text = "Loading Home";
  }
  return (
    <span role="status" className="sr-only">
      {text}
    </span>
  );
}

/**
 * The reason with a full stop at its end when it has none, so screen readers don't run two
 * reasons together. The Studio's own reasons end in one; an engine's message may not.
 */
function asSentence(reason: string): string {
  const trimmed = reason.trimEnd();
  return /[.!?…]$/u.test(trimmed) ? trimmed : `${trimmed}.`;
}
