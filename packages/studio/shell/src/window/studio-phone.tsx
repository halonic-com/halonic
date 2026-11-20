import type { ReactNode, RefCallback, RefObject } from "react";
import { PageErrorBoundary } from "../page/page-error-boundary.tsx";
import type { ShellPhoneSearchProps } from "../palette/shell-phone-search.tsx";
import { MorePage, type MorePageSwitcher } from "../phone/more-page.tsx";
import { PhoneSearchButton } from "../phone/phone-search-button.tsx";
import { PhoneTopBar } from "../phone/phone-top-bar.tsx";
import { settingsLocation } from "../phone/place-stacks.ts";
import {
  SettingsListPage,
  sectionIdOfLocationKey,
  sectionLocation,
} from "../phone/settings-list-page.tsx";
import type { PhonePlaces } from "../phone/use-phone-places.ts";
import type { SettingsSectionContribution, ShownPlace } from "../points/frame.ts";
import type { Registered } from "../points/point-store.ts";
import { SectionView } from "../settings/settings-dialog.tsx";
import { listedSections, type SettingsPlace, settingsGroups } from "../settings/settings-groups.ts";
import type { WorkspaceSwitcherProps } from "../sidebar/workspace-switcher.tsx";
import { StudioPage, type StudioPageProps } from "./studio-page.tsx";

/** Props for {@link StudioPhoneTopBar}. */
export interface StudioPhoneTopBarProps {
  /** The phone's places, from `usePhonePlaces`. */
  readonly places: PhonePlaces;
  /** What the Search sheet searches; a pick opens on the phone, in its places. */
  readonly search: Omit<ShellPhoneSearchProps, "onOpenLocation" | "onClose">;
  /** Gets the slot the page's own buttons go in (`PhoneTopBarActions`), after **Search**. */
  readonly slot: RefCallback<HTMLElement>;
}

/**
 * The phone's top bar in the Studio window (`shell.studio-phone`): the page's title, Back under
 * the top of a place, **Search** at the top of a place, and then the page's own buttons
 * (`shell.phone-top-bar-actions`), so an overflow ⋮ is always last.
 */
export function StudioPhoneTopBar({ places, search, slot }: StudioPhoneTopBarProps) {
  const atPlaceTop = places.topBar.onBack === undefined;
  return (
    <PhoneTopBar
      {...places.topBar}
      actions={
        <>
          {atPlaceTop ? <PhoneSearchButton {...search} onOpenLocation={places.open} /> : null}
          {/* Its children are the top bar's own flex items, 4px apart like the rest. */}
          <span ref={slot} className="contents" />
        </>
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
  /** The sidebar's switcher, for More in a desktop window as narrow as a phone. */
  readonly menuSwitcher?: WorkspaceSwitcherProps | undefined;
  /** The More page's header badge, on its own line under the switcher row. */
  readonly badge?: ReactNode;
  /**
   * The desktop's header badges, the features' ones such as "Not trusted yet · Review" first, for
   * More when there is no `badge`: a desktop window as narrow as a phone has no status bar to show
   * them in (WCAG 1.4.10).
   */
  readonly desktopBadges?: ReactNode;
  /** The window's `openSettings`: with it, More ends with a Settings row. */
  readonly onSettings?: (() => void) | undefined;
  /** In the desktop app, or in a browser, as Settings words its saved lines. */
  readonly settingsPlace: SettingsPlace;
  /** The Settings sections the window has, as Settings' list and its pages show them. */
  readonly settingsSections: readonly Registered<SettingsSectionContribution>[];
  /** The system's region format, handed on to each Settings section. */
  readonly regionFormat?: string | undefined;
  /** Where the Settings list's scroll position is kept while a section's page is open. */
  readonly settingsScroll: RefObject<number>;
  /** The open workspace's name, which heads its group in Settings' list. */
  readonly workspaceName: string | undefined;
}

/**
 * The page the phone shows (`shell.studio-phone`): the More page at the top of More, Settings' list
 * and its sections' pages (`shell.settings-list-page`), else the
 * same page a desktop tab would show for that place, Home or a place's view. Each page is drawn
 * fresh, as the place stacks keep where the user is, not the page's own state.
 *
 * As a desktop tab's page, it sits in a `PageErrorBoundary`: a page that throws or fails to load
 * shows "This page stopped working", and the top bar and the bottom navigation keep working.
 */
export function StudioPhonePage(props: StudioPhonePageProps) {
  const { location } = props.places.page;
  return (
    // Keyed by the place, so moving on to another place starts a fresh boundary and page.
    <PageErrorBoundary pageKey={location.key} pageName={location.title}>
      <PhonePageBody {...props} />
    </PageErrorBoundary>
  );
}

/** The page itself: the More page, Settings' list or one of its sections, or a desktop tab's page. */
function PhonePageBody({
  places,
  shown,
  switcher,
  menuSwitcher,
  badge,
  desktopBadges,
  onSettings,
  settingsPlace,
  settingsSections,
  regionFormat,
  settingsScroll,
  workspaceName,
  ...page
}: StudioPhonePageProps) {
  const { location } = places.page;
  if (location.key === "more") {
    return (
      <MorePage
        switcher={switcher}
        menuSwitcher={menuSwitcher}
        badge={badge ?? desktopBadges}
        places={shown}
        onOpen={(place) => places.openPlace(place)}
        onSettings={onSettings}
        inDesktopApp={settingsPlace === "app"}
      />
    );
  }
  if (location.key === settingsLocation.key) {
    return (
      <SettingsListPage
        sections={settingsSections}
        workspaceName={workspaceName}
        place={settingsPlace}
        contextFor={page.contextFor}
        scroll={settingsScroll}
        onOpen={(opened) => places.open(sectionLocation(opened))}
      />
    );
  }
  const sectionId = sectionIdOfLocationKey(location.key);
  if (sectionId !== undefined) {
    // The same sections the list shows, so a link to one it leaves out opens nothing.
    const section = listedSections(
      settingsGroups({
        sections: settingsSections,
        workspaceName,
        place: settingsPlace,
        phone: true,
      }),
    ).find((candidate) => candidate.id === sectionId);
    return section === undefined ? null : (
      // The dialog pads a section; on the phone this wrapper does, so no section pads itself.
      <div data-testid="settings-section-page" className="px-4 pb-6">
        <SectionView
          page
          section={section}
          context={page.contextFor(section.featureId)}
          closeSettings={() => places.back()}
          place={settingsPlace}
          surface="phone"
          regionFormat={regionFormat}
          workspaceName={workspaceName}
          announce={(words) => page.announcer.announce(words)}
        />
      </div>
    );
  }
  return <StudioPage location={location} {...page} />;
}
