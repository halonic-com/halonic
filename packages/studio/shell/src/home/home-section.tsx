import { EmptyState, ListHeading } from "@halonicjs/studio-kit";
import {
  Component,
  type ComponentType,
  lazy,
  type ReactNode,
  type RefObject,
  Suspense,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { errorMessageFor } from "../errors/error-message.ts";
import { type HomeCardContribution, type HomeSection, homeSectionTitles } from "../points/home.ts";
import type { Registered } from "../points/point-store.ts";
import { loadView } from "../view.ts";
import type { WorkspaceContext } from "../workspace-context.ts";
import { SectionSkeleton } from "./home-loading.tsx";

/** What a Home card's view gets: the context of the feature that added the card. */
export interface HomeCardProps {
  readonly context: WorkspaceContext;
}

/** The heading of each section's error when its card can't load (microcopy 3.3). */
export const homeSectionErrors: Readonly<Record<HomeSection, string>> = {
  setup: "Couldn't load setup",
  "needs-you": "Couldn't load what needs you",
  "recent-runs": "Couldn't load recent runs",
};

/** Get set up shows no skeleton: it appears only once it knows setup isn't done (PH 2.6). */
const withoutSkeleton: ReadonlySet<HomeSection> = new Set<HomeSection>(["setup"]);

/** Props for {@link HomeSectionRegion}. */
export interface HomeSectionRegionProps {
  readonly card: Registered<HomeCardContribution>;
  readonly context: WorkspaceContext;
}

/**
 * One section of Home: a region named by its heading, with the card's rows under it. The section
 * loads and fails on its own (UX checklist 1.9): its skeleton while the card's view or its data
 * loads, and in place of the rows, if either fails, the start-aligned error with Try again. When
 * Try again works, focus goes to the heading; when it fails again, to the error's title.
 *
 * A card's view shows it is loading by suspending, as with React's `use`, and that it failed by
 * throwing.
 */
export function HomeSectionRegion({ card, context }: HomeSectionRegionProps) {
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [attempt, setAttempt] = useState(0);
  const CardView = useCardView(card, attempt);
  const retried = attempt > 0;
  const retry = () => setAttempt((count) => count + 1);

  return (
    <section aria-labelledby={headingId}>
      <ListHeading id={headingId} headingRef={headingRef} name={homeSectionTitles[card.id]} />
      <CardErrorBoundary
        // A new attempt starts a new boundary, which forgets the error and mounts the card again.
        key={attempt}
        fallback={(error) => (
          <SectionError section={card.id} error={error} focus={retried} onRetry={retry} />
        )}
      >
        <Suspense fallback={withoutSkeleton.has(card.id) ? null : <SectionSkeleton />}>
          <CardView context={context} />
          {retried ? <FocusOnShow target={headingRef} /> : null}
        </Suspense>
      </CardErrorBoundary>
    </section>
  );
}

/** The card's view, imported the first time the section shows, and again for each Try again. */
function useCardView(card: HomeCardContribution, attempt: number): ComponentType<HomeCardProps> {
  // A new attempt makes a new `lazy`, so it imports again: `lazy` keeps a failed import.
  return useMemo(
    () =>
      lazy(async () => ({
        default: await loadView<ComponentType<HomeCardProps>>(card),
      })),
    [card, attempt],
  );
}

function SectionError({
  section,
  error,
  focus,
  onRetry,
}: {
  readonly section: HomeSection;
  readonly error: unknown;
  readonly focus: boolean;
  readonly onRetry: () => void;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const title = homeSectionErrors[section];
  return (
    <>
      <EmptyState
        tone="error"
        align="start"
        headingLevel={3}
        titleRef={titleRef}
        title={title}
        description={errorMessageFor(error, { title }).body}
        action={{ label: "Try again", onClick: onRetry }}
      />
      {focus ? <FocusOnShow target={titleRef} /> : null}
    </>
  );
}

/** Moves focus to `target` when it shows, as Try again's button has just gone (a11y 1.4). */
function FocusOnShow({ target }: { readonly target: RefObject<HTMLElement | null> }) {
  useLayoutEffect(() => {
    target.current?.focus();
  }, [target]);
  return null;
}

interface CardErrorBoundaryState {
  /** The error the card threw, in an object, since a card may throw anything, even `undefined`. */
  readonly failed: { readonly error: unknown } | undefined;
}

interface CardErrorBoundaryProps {
  readonly fallback: (error: unknown) => ReactNode;
  readonly children: ReactNode;
}

/**
 * Catches a card that fails to load or draw, so one section failing doesn't blank Home. React has
 * no hook for this: an error boundary is a class.
 */
class CardErrorBoundary extends Component<CardErrorBoundaryProps, CardErrorBoundaryState> {
  override state: CardErrorBoundaryState = { failed: undefined };

  static getDerivedStateFromError(error: unknown): CardErrorBoundaryState {
    return { failed: { error } };
  }

  override render(): ReactNode {
    const { failed } = this.state;
    return failed === undefined ? this.props.children : this.props.fallback(failed.error);
  }
}
