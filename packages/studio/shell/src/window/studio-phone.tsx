import { PageErrorBoundary } from "../page/page-error-boundary.tsx";
import type { ShellPhoneSearchProps } from "../palette/shell-phone-search.tsx";
import { MorePage, type MorePageSwitcher } from "../phone/more-page.tsx";
import { PhoneSearchButton } from "../phone/phone-search-button.tsx";
import { PhoneTopBar } from "../phone/phone-top-bar.tsx";
import type { PhonePlaces } from "../phone/use-phone-places.ts";
import type { ShownPlace } from "../points/frame.ts";
import { StudioPage, type StudioPageProps } from "./studio-page.tsx";

/** Props for {@link StudioPhoneTopBar}. */
export interface StudioPhoneTopBarProps {
  /** The phone's places, from `usePhonePlaces`. */
  readonly places: PhonePlaces;
  /** What the Search sheet searches; a pick opens on the phone, in its places. */
  readonly search: Omit<ShellPhoneSearchProps, "onOpenLocation" | "onClose">;
}

/**
 * The phone's top bar in the Studio window (`shell.studio-phone`): the page's title, Back under
 * the top of a place, and **Search** at the top of a place. A page below a place gets its own
 * actions there once a feature gives it some (its ⋮, "1 of 3").
 */
export function StudioPhoneTopBar({ places, search }: StudioPhoneTopBarProps) {
  const atPlaceTop = places.topBar.onBack === undefined;
  return (
    <PhoneTopBar
      {...places.topBar}
      actions={
        atPlaceTop ? <PhoneSearchButton {...search} onOpenLocation={places.open} /> : undefined
      }
    />
  );
}

/** Props for {@link StudioPhonePage}. */
export interface StudioPhonePageProps extends Omit<StudioPageProps, "location"> {
  /** The phone's places, from `usePhonePlaces`. */
  readonly places: PhonePlaces;
  /** Home and the places features added, with their signals, for the More page's lists. */
  readonly shown: readonly ShownPlace[];
  /** The More page's workspace switcher row, once the app has a workspace picker (T3). */
  readonly switcher?: MorePageSwitcher | undefined;
}

/**
 * The page the phone shows (`shell.studio-phone`): the More page at the top of More, else the
 * same page a desktop tab would show for that place, Home or a place's view. Each page is drawn
 * fresh, as the place stacks keep where the user is, not the page's own state.
 *
 * As a desktop tab's page, it sits in a `PageErrorBoundary`: a page that throws or fails to load
 * shows "This page stopped working", and the top bar and the bottom navigation keep working.
 */
export function StudioPhonePage({ places, shown, switcher, ...page }: StudioPhonePageProps) {
  const { location } = places.page;
  return (
    // Keyed by the place, so moving on to another place starts a fresh boundary and page.
    <PageErrorBoundary pageKey={location.key} pageName={location.title}>
      {location.key === "more" ? (
        <MorePage switcher={switcher} places={shown} onOpen={(place) => places.openPlace(place)} />
      ) : (
        <StudioPage location={location} {...page} />
      )}
    </PageErrorBoundary>
  );
}
