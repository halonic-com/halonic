// The phone part of the public API of @halonicjs/studio-shell, re-exported by
// `index.ts` to keep that file under the size limit.
export {
  BottomNavigation,
  type BottomNavigationPlace,
  type BottomNavigationProps,
} from "./phone/bottom-navigation.tsx";
export {
  MorePage,
  type MorePageProps,
  type MorePageSwitcher,
  moreRows,
} from "./phone/more-page.tsx";
export { type PhoneBackResult, pressPhoneBack, usePhoneBackButton } from "./phone/phone-back.ts";
export {
  PhoneSearchButton,
  type PhoneSearchButtonProps,
} from "./phone/phone-search-button.tsx";
export { PhoneTopBar, type PhoneTopBarProps } from "./phone/phone-top-bar.tsx";
export {
  PhoneTopBarActions,
  type PhoneTopBarActionsProps,
  PhoneTopBarSlot,
  useInPhoneTopBar,
} from "./phone/phone-top-bar-actions.tsx";
export {
  currentPhonePage,
  goBackOnPhone,
  isAtPlaceTop,
  openPhonePage,
  openPhonePageIn,
  type PhoneOpenOptions,
  type PhonePage,
  type PhonePlace,
  type PlaceStacks,
  phonePlaceOf,
  phonePlaces,
  phonePlaceTops,
  settingsLocation,
  showsBottomNavigation,
  startPlaceStacks,
  switchPhonePlace,
} from "./phone/place-stacks.ts";
export { type PhonePlaces, usePhonePlaces } from "./phone/use-phone-places.ts";
