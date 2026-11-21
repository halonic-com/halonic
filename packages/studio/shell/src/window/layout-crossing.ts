import { useLayoutEffect, useRef } from "react";
import { settingsLocation } from "../phone/place-stacks.ts";
import { sectionIdOfLocationKey } from "../phone/settings-list-page.tsx";
import type { PhonePlaces } from "../phone/use-phone-places.ts";
import { isSidebarPlace, placeNames, type SidebarPlace } from "../points/frame.ts";
import { usePageHeadingFocus } from "../tabs/history-moves.ts";
import { currentLocation, type TabLocation, type TabSet } from "../tabs/tab-set.ts";
import { itemOfLocationKey } from "./item-view.tsx";

/** What the desktop shows for the phone's page as the window widens: see {@link desktopPageOf}. */
export type DesktopPage =
  | { readonly kind: "tab"; readonly location: TabLocation }
  | { readonly kind: "settings"; readonly sectionId: string | undefined }
  | { readonly kind: "none" };

/**
 * The desktop's page for the page the phone shows. Most pages are the same on both, and open in
 * a tab. Settings' list and its sections are the Settings dialog on the desktop. A list or a page
 * a place pushed (`place/sub`) has no desktop page, so its place opens instead. The More page has
 * none either: the desktop's sidebar does its work, so the desktop keeps the tab it had.
 */
export function desktopPageOf(location: TabLocation): DesktopPage {
  if (location.key === "more") {
    return { kind: "none" };
  }
  if (location.key === settingsLocation.key) {
    return { kind: "settings", sectionId: undefined };
  }
  const sectionId = sectionIdOfLocationKey(location.key);
  if (sectionId !== undefined) {
    return { kind: "settings", sectionId };
  }
  const [place, sub, ...rest] = location.key.split("/");
  if (place !== undefined && isSidebarPlace(place) && sub !== undefined && rest.length === 0) {
    return { kind: "tab", location: { key: place, title: placeNames[place].label } };
  }
  return { kind: "tab", location };
}

/** What {@link useOpenPageAcrossLayouts} moves between. */
export interface LayoutCrossing {
  /** Whether the window shows the desktop layout now. */
  readonly desktop: boolean;
  readonly tabs: TabSet;
  readonly phone: PhonePlaces;
  /** The sidebar place that lists an item of this kind, as its kind names it, if any. */
  readonly placeOfKind: (kind: string) => SidebarPlace | undefined;
  /** Opens the desktop's Settings dialog, on a section if one is given. */
  readonly showSettings: (sectionId?: string) => void;
}

/**
 * Keeps the open page open when the window crosses the phone width, either way (HAL-13726,
 * decided by the team): narrowed, the phone shows the active tab's page where it lives, with Back
 * to its parent (`showPhonePage`); widened, the desktop shows the phone's page in the active tab,
 * or the tab that already shows it ({@link desktopPageOf}). Focus goes to the page's title, as when
 * a page opens; Settings opened as a dialog takes the focus itself.
 *
 * It runs before the browser paints, so the new layout never shows the page it had before.
 */
export function useOpenPageAcrossLayouts(crossing: LayoutCrossing): void {
  const { desktop } = crossing;
  const wasDesktop = useRef(desktop);
  // Read when the width crosses, so the effect runs only then.
  const latest = useRef(crossing);
  latest.current = crossing;
  const focusNewPage = usePageHeadingFocus();

  useLayoutEffect(() => {
    if (wasDesktop.current === desktop) {
      return;
    }
    wasDesktop.current = desktop;
    const { tabs, phone, placeOfKind, showSettings } = latest.current;
    if (!desktop) {
      const location = currentLocation(tabs.active);
      const item = itemOfLocationKey(location.key);
      phone.show(location, item === undefined ? undefined : placeOfKind(item.kind));
      focusNewPage();
      return;
    }
    const page = desktopPageOf(phone.page.location);
    if (page.kind === "settings") {
      showSettings(page.sectionId);
      return;
    }
    if (page.kind === "tab" && currentLocation(tabs.active).key !== page.location.key) {
      tabs.openHere(page.location);
    }
    focusNewPage();
  }, [desktop, focusNewPage]);
}
