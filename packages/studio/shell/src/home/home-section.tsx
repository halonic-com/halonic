import { EmptyState, ListHeading } from "@halonicjs/studio-kit";
import {
  type ComponentType,
  createContext,
  lazy,
  type RefObject,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { errorMessageFor } from "../errors/error-message.ts";
import { type HomeCardContribution, type HomeSection, homeSectionTitles } from "../points/home.ts";
import type { Registered } from "../points/point-store.ts";
import { loadView } from "../view.ts";
import { ViewErrorBoundary } from "../view-error-boundary.tsx";
import type { WorkspaceContext } from "../workspace-context.ts";
import { HomeErrorReport } from "./home-errors.ts";
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
  cards: "Couldn't load cards",
};

/** Get set up shows no skeleton: it appears only once it knows setup isn't done (PH 2.6). */
const withoutSkeleton: ReadonlySet<HomeSection> = new Set<HomeSection>(["setup"]);

/** Tells the section whether its card has nothing to show; see {@link HomeSectionEmpty}. */
const HomeSectionEmptyReport = createContext<(empty: boolean) => void>(() => {});

/**
 * Rendered by a card's view when it has nothing to show, such as Cards while no plugin that's
 * installed has a card (plugins design 8.2). The whole section, heading included, is hidden while
 * it's rendered, so Home never shows a heading with nothing under it. The view stays mounted, so
 * the section comes back as soon as the view renders something else.
 *
 * @example
 * if (cards.length === 0) return <HomeSectionEmpty />;
 */
export function HomeSectionEmpty() {
  const report = useContext(HomeSectionEmptyReport);
  useLayoutEffect(() => {
    report(true);
    return () => report(false);
  }, [report]);
  return null;
}

/** Props for {@link HomeSectionRegion}. */
export interface HomeSectionRegionProps {
  readonly card: Registered<HomeCardContribution>;
  readonly context: WorkspaceContext;
}

/**
 * One section of Home: a region named by its heading, with the card's rows under it. The section
 * loads and fails on its own (UX checklist 1.9): its skeleton while the card's view or its data
 * loads, and in place of the rows, if either fails, the start-aligned error with Try again. When
 * Try again works, focus goes to the heading; when it fails again, to the error's title. Focus moves
 * only right after Try again: if the card later loads again (a data refresh), focus stays where the
 * user put it.
 *
 * A card's view shows it is loading by suspending, as with React's `use`, and that it failed by
 * throwing.
 */
export function HomeSectionRegion({ card, context }: HomeSectionRegionProps) {
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [attempt, setAttempt] = useState(0);
  const CardView = useCardView(card, attempt);
  // Set by Try again and cleared once focus has moved. React runs a shown child's layout effects
  // again each time its Suspense shows it again, so a flag that stayed set would move focus again.
  const [focusPending, setFocusPending] = useState(false);
  const retry = () => {
    setAttempt((count) => count + 1);
    setFocusPending(true);
  };
  const focusMoved = useCallback(() => setFocusPending(false), []);
  const [empty, setEmpty] = useState(false);
  const signal = useCardSignal(card, context);

  return (
    <section aria-labelledby={headingId} hidden={empty}>
      <ListHeading
        id={headingId}
        headingRef={headingRef}
        name={homeSectionTitles[card.id]}
        {...(signal === undefined ? {} : { detail: signal })}
      />
      <ViewErrorBoundary
        // A new attempt starts a new boundary, which forgets the error and mounts the card again.
        key={attempt}
        fallback={(error) => (
          <SectionError
            section={card.id}
            error={error}
            focus={focusPending}
            onFocused={focusMoved}
            onRetry={retry}
          />
        )}
      >
        <Suspense fallback={skeletonFor(card.id)}>
          <HomeSectionEmptyReport value={setEmpty}>
            <CardView context={context} />
          </HomeSectionEmptyReport>
          {focusPending ? <FocusOnShow target={headingRef} onFocused={focusMoved} /> : null}
        </Suspense>
      </ViewErrorBoundary>
    </section>
  );
}

/**
 * The words of the card's signal for its heading, such as "1 waiting", or `undefined` at zero or
 * without one. Read again whenever the card says its signal changed.
 */
function useCardSignal(card: HomeCardContribution, context: WorkspaceContext): string | undefined {
  // Home builds a new context each render; the latest one is read, so the section subscribes once.
  const latest = useRef(context);
  latest.current = context;
  const subscribe = useCallback(
    (listener: () => void) => card.subscribeSignal?.(latest.current, listener) ?? (() => {}),
    [card],
  );
  return useSyncExternalStore(subscribe, () => {
    const signal = card.signal?.(latest.current);
    return signal === undefined || signal.value <= 0 ? undefined : signal.spoken;
  });
}

/** What a section shows while its card loads: none for Get set up, cards for Cards, else rows. */
function skeletonFor(section: HomeSection) {
  if (withoutSkeleton.has(section)) {
    return null;
  }
  return <SectionSkeleton shape={section === "cards" ? "cards" : "rows"} />;
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
  onFocused,
  onRetry,
}: {
  readonly section: HomeSection;
  readonly error: unknown;
  readonly focus: boolean;
  readonly onFocused: () => void;
  readonly onRetry: () => void;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const title = homeSectionErrors[section];
  const reason = errorMessageFor(error, { title }).body.trim();
  // The error isn't a live region: the page says the reason once for every section (a11y 1.5).
  // A kinded error without a message, or with only spaces, has no reason to say; reporting it
  // would only hide "Loading Home" while other sections still load, or say a lone full stop.
  const report = useContext(HomeErrorReport);
  useEffect(() => (reason === "" ? undefined : report(reason)), [report, reason]);
  return (
    <>
      <EmptyState
        tone="error"
        align="start"
        headingLevel={3}
        titleRef={titleRef}
        title={title}
        description={reason}
        action={{ label: "Try again", onClick: onRetry }}
      />
      {focus ? <FocusOnShow target={titleRef} onFocused={onFocused} /> : null}
    </>
  );
}

/**
 * Moves focus to `target` when it shows, as Try again's button has just gone (a11y 1.4), then
 * calls `onFocused` so the section can stop rendering it.
 */
function FocusOnShow({
  target,
  onFocused,
}: {
  readonly target: RefObject<HTMLElement | null>;
  readonly onFocused: () => void;
}) {
  useLayoutEffect(() => {
    target.current?.focus();
    onFocused();
  }, [target, onFocused]);
  return null;
}
