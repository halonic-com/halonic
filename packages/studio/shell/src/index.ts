// The public API of @halonicjs/studio-shell. Everything else in src/ is internal.
export {
  type AnnounceOptions,
  type Announcer,
  type AnnouncerOptions,
  announceQuietMs,
  createAnnouncer,
  type LiveRegion,
  type LiveRegions,
  type Politeness,
} from "./announcer/announcer.ts";
export type { AnnouncerTimers } from "./announcer/timers.ts";
export {
  backToCard,
  type CardStack,
  cardPath,
  cardsShownBehind,
  closeTopCard,
  type DroppedCards,
  dockedCardCoversPanel,
  dockedCardMinPanelWidth,
  dropGoneCards,
  noCards,
  openCard,
  type StackedCard,
  shownCards,
  topCardName,
} from "./cards/card-stack.ts";
export { StackedCards, type StackedCardsProps } from "./cards/stacked-cards.tsx";
export {
  type CloseLayer,
  type CloseLayerKind,
  type CloseStack,
  closeLayerKinds,
  createCloseStack,
  type EscapePress,
} from "./close-stack/close-stack.ts";
export {
  type DialogHostProps,
  FeatureDialogs,
  type FeatureDialogsProps,
} from "./dialogs/feature-dialogs.tsx";
export {
  createShellEngine,
  type EngineConnectionEvent,
  type EngineConnectionListener,
  type ShellEngine,
  type ShellEngineState,
} from "./engine/engine-connection.ts";
export { EngineLine, type EngineLineProps } from "./engine/engine-line.tsx";
export {
  type EngineLauncher,
  type EngineProcess,
  type EngineProcessEvents,
  type EngineStartEvent,
  type EngineStartFailure,
  type EngineStartFailureReason,
  type EngineSupervisor,
  engineAnswerTimeoutMs,
  engineRestartDelayMs,
  engineRestartWindowMs,
} from "./engine/engine-start.ts";
export { type EngineWords, engineWords, type StudioHost } from "./engine/engine-words.ts";
export { copyDetailsWords, detailsOf } from "./errors/copy-details-words.ts";
export {
  type ErrorAction,
  type ErrorContext,
  type ErrorMessage,
  errorMessageFor,
  itemGoneWords,
  type RulePlace,
} from "./errors/error-message.ts";
export { defineFeature, type Feature, type FeatureDefinition } from "./feature.ts";
export {
  narrowQuery,
  phoneQuery,
  useNarrowWindow,
  usePresentationFromWidth,
} from "./frame/frame-effects.ts";
export { ShellFrame, type ShellFrameProps } from "./frame/shell-frame.tsx";
export {
  type StatusBarItemProps,
  StatusBarItems,
  type StatusBarItemsProps,
} from "./frame/status-bar.tsx";
export type { HomeCardProps } from "./home/home-page.tsx";
export { HomeSectionEmpty } from "./home/home-section.tsx";
export { ItemHeader, type ItemHeaderProps } from "./item-page/item-header.tsx";
export { ItemPage, type ItemPageChat, type ItemPageProps } from "./item-page/item-page.tsx";
export { useRememberedView } from "./item-page/remembered-view.ts";
export { copyDetails, useCopyDetails } from "./page/copy-details.ts";
export { ItemGone, type ItemGoneProps } from "./page/item-gone.tsx";
export {
  PageErrorBoundary,
  type PageErrorBoundaryProps,
  pageStoppedWords,
} from "./page/page-error-boundary.tsx";
export { CommandPalette, type CommandPaletteProps } from "./palette/command-palette.tsx";
export {
  compareNameMatches,
  findWords,
  matchName,
  type NameMatch,
  type NameMatchRank,
  nameMatchRanks,
  type WordsFound,
  type WordsOptions,
} from "./palette/name-match.ts";
export {
  itemLocationKey,
  type PaletteContent,
  type PaletteGroup,
  type PaletteGroupId,
  type PaletteRow,
  type PaletteSources,
  type PaletteTarget,
  paletteGroupRows,
  paletteGroups,
  paletteGroupTitles,
} from "./palette/palette-groups.ts";
export { type PaletteOpening, usePaletteOpening } from "./palette/palette-opening.ts";
export {
  type ActiveRowChange,
  keptActive,
  movedActive,
  type PaletteKey,
  type PaletteKindNames,
  paletteKeyFor,
  paletteOptionName,
  paletteOptions,
  resultCountDelayMs,
  resultCountText,
} from "./palette/palette-options.ts";
export {
  PhoneSearchSheet,
  type PhoneSearchSheetProps,
} from "./palette/phone-search-sheet.tsx";
export { RecentPlaces, recentPlacesKept } from "./palette/recent-places.ts";
export { type FoundItems, searchProviders } from "./palette/search-providers.ts";
export {
  ShellPalette,
  type ShellPaletteProps,
  usePaletteKey,
} from "./palette/shell-palette.tsx";
export {
  ShellPhoneSearch,
  type ShellPhoneSearchProps,
} from "./palette/shell-phone-search.tsx";
export { type PaletteSearch, usePaletteSearch } from "./palette/use-palette-search.ts";
export {
  CHAT_MIN_WIDTH,
  clampPanelWidth,
  ITEM_PAGE_LEAD,
  PANEL_DEFAULT_WIDTH,
  PANEL_GAP,
  PANEL_MAX_WIDTH,
  PANEL_MIN_WIDTH,
  panelEdgeLimits,
  panelFitsBeside,
  savedPanelWidth,
  shownPanelWidth,
} from "./panels/panel-width.ts";
export {
  PanelWidthProvider,
  type PanelWidthProviderProps,
} from "./panels/panel-width-context.tsx";
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
export {
  type ChildProcessUsage,
  type EngineResourceReport,
  type LoadedModel,
  readResourceReport,
} from "./resources/resource-report.ts";
export {
  lowDiskBytes,
  type ResourceCheckReason,
  type ResourceListener,
  type ResourceReading,
  type ResourceWatch,
  type ResourceWatchOptions,
  resourceCheckIntervalMs,
  watchResources,
} from "./resources/resource-watch.ts";
export { type SaveFailure, type SaveReason, saveFailureFor } from "./save/save-failure.ts";
export {
  announceSaveNotes,
  type SaveNoteAction,
  type SaveNoteMark,
  type SaveNoteWords,
  saveNoteActionLabels,
  saveNoteWords,
} from "./save/save-note-words.ts";
export {
  couldNotSaveText,
  type SaveNote,
  SaveState,
  type SavingItem,
} from "./save/save-state.ts";
export { SearchPage, type SearchPageProps } from "./search/search-page.tsx";
export {
  type NameResult,
  type SearchPageNames,
  type SearchPageQuery,
  type SearchScope,
  searchPageCount,
  searchPageLocation,
  searchPageNames,
  searchPageWords,
} from "./search/search-page-names.ts";
export type {
  FeatureServices,
  ServiceFactory,
  ServiceLookup,
  ServiceTarget,
} from "./service-catalog.ts";
export { type ServiceKey, serviceKey } from "./service-key.ts";
export {
  SettingsDialog,
  type SettingsDialogProps,
  type SettingsSectionProps,
} from "./settings/settings-dialog.tsx";
export {
  type SettingsGroup,
  type SettingsGroupsInput,
  type SettingsPlace,
  settingsGroups,
} from "./settings/settings-groups.ts";
export { createShell, type Shell, type ShellOptions } from "./shell.ts";
export { ShellError } from "./shell-error.ts";
export { PlacesList, type PlacesListProps } from "./sidebar/places-list.tsx";
export {
  SidebarResizeEdge,
  type SidebarResizeEdgeProps,
} from "./sidebar/sidebar-resize-edge.tsx";
export { SidebarSearch, type SidebarSearchProps } from "./sidebar/sidebar-search.tsx";
export {
  clampSidebarWidth,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
} from "./sidebar/sidebar-width.ts";
export {
  type SwitcherWorkspace,
  WorkspaceSwitcher,
  type WorkspaceSwitcherProps,
} from "./sidebar/workspace-switcher.tsx";
export type { Studio } from "./studio.ts";
export { mountedTabIds, mountedTabLimit } from "./tabs/mounted-tabs.ts";
export { type GoneItem, TabPages, type TabPagesProps } from "./tabs/tab-pages.tsx";
export {
  currentLocation,
  homeLocation,
  type OpenedTab,
  reopenableTabs,
  type TabLocation,
  TabSet,
  type TabSetState,
  type WindowTab,
} from "./tabs/tab-set.ts";
export { useWindowKeys, type WindowKeysOptions } from "./tabs/use-window-keys.ts";
export { type PressedKey, type WindowKey, windowKeyFor } from "./tabs/window-keys.ts";
export { WindowTabStrip, type WindowTabStripProps } from "./tabs/window-tab-strip.tsx";
export { Toolbar, type ToolbarProps } from "./toolbar/toolbar.tsx";
export {
  SAVING_AFTER_MS,
  ToolbarSaveNote,
  type ToolbarSaveNoteProps,
} from "./toolbar/toolbar-save-note.tsx";
export { loadView, type ViewRef } from "./view.ts";
export {
  cantOpenProblem,
  cantOpenWords,
  type WelcomeOpenProblem,
} from "./welcome/cant-open.ts";
export {
  removeFromRecentLabel,
  Welcome,
  type WelcomeProps,
  type WelcomeRecentList,
} from "./welcome/welcome.tsx";
export {
  WELCOME_RECENT_ROWS,
  type WelcomeRecentWorkspace,
} from "./welcome/welcome-recent.tsx";
export { WelcomeWindow, type WelcomeWindowProps } from "./welcome/welcome-window.tsx";
export type { ItemViewProps } from "./window/item-view.tsx";
export {
  type MountedStudioWindow,
  mountStudioWindow,
} from "./window/mount-studio-window.tsx";
export { shownPlaces } from "./window/shown-places.ts";
export { type PlaceViewProps, StudioPage, type StudioPageProps } from "./window/studio-page.tsx";
export {
  StudioPhonePage,
  type StudioPhonePageProps,
  StudioPhoneTopBar,
  type StudioPhoneTopBarProps,
} from "./window/studio-phone.tsx";
export { StudioSidebar, type StudioSidebarProps } from "./window/studio-sidebar.tsx";
export { StudioWindow, type StudioWindowProps } from "./window/studio-window.tsx";
export { StudioWorkspace, type StudioWorkspaceOptions } from "./window/studio-workspace.ts";
export type { WorkspaceContext } from "./workspace-context.ts";
