// The points part of the public API of @halonicjs/studio-shell, re-exported by
// `index.ts` to keep that file under the size limit.
export type {
  CommandContributions,
  CommandPoints,
  ContextFor,
} from "./points/command-points.ts";
export type {
  CommandContribution,
  CommandSource,
  KeybindingContribution,
  PersistContribution,
  PersistedSession,
  SearchProviderContribution,
  SearchResult,
} from "./points/commands.ts";
export {
  type BarItemContribution,
  type CardContribution,
  type DialogHostContribution,
  type HelpContribution,
  type HelpItem,
  type PanelWindowContribution,
  type PhoneBarContribution,
  type PlaceContribution,
  type PlaceName,
  type PlaceSignal,
  placeNames,
  type SettingsScope,
  type SettingsSectionContribution,
  type ShownPlace,
  type SidebarPlace,
  type SidebarViewAction,
  type SidebarViewContribution,
  type StripContribution,
  settingsScopes,
  showPlace,
  sidebarPlaces,
} from "./points/frame.ts";
export type { FrameContributions, FramePoints } from "./points/frame-points.ts";
export {
  type HomeCardContribution,
  type HomePoint,
  type HomeSection,
  homeSections,
  homeSectionTitles,
} from "./points/home.ts";
export type {
  ItemAction,
  ItemKindContribution,
  ItemRef,
  OpenItemOptions,
  TabBehaviour,
  TabDescription,
} from "./points/item-kinds.ts";
export { hintKeys } from "./points/key-hints.ts";
export type { KeyboardPlatform } from "./points/keybindings.ts";
export type {
  ExplorerGroupContribution,
  ExplorerItem,
  ExplorerSectionContribution,
  ItemPageSectionContribution,
} from "./points/layout.ts";
export type { LayoutContributions, LayoutPoints } from "./points/layout-points.ts";
export type {
  Contributed,
  Ordered,
  Point,
  Registered,
} from "./points/point-store.ts";
export {
  bySettingsGroup,
  firstSettingsSection,
  settingsSectionToOpen,
} from "./points/settings-sections.ts";
