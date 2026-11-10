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
  type CloseLayer,
  type CloseLayerKind,
  type CloseStack,
  closeLayerKinds,
  createCloseStack,
  type EscapePress,
} from "./close-stack/close-stack.ts";
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
export { useCopyDetails } from "./page/copy-details.ts";
export { ItemGone, type ItemGoneProps } from "./page/item-gone.tsx";
export {
  PageErrorBoundary,
  type PageErrorBoundaryProps,
  pageStoppedWords,
} from "./page/page-error-boundary.tsx";
export {
  compareNameMatches,
  matchName,
  type NameMatch,
  type NameMatchRank,
  nameMatchRanks,
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
export { type FoundItems, searchProviders } from "./palette/search-providers.ts";
export type { CommandContributions, CommandPoints } from "./points/command-points.ts";
export type {
  CommandContribution,
  KeybindingContribution,
  PersistContribution,
  PersistedSession,
  SearchProviderContribution,
  SearchResult,
} from "./points/commands.ts";
export {
  type BarItemContribution,
  type CardContribution,
  type PanelWindowContribution,
  type PhoneBarContribution,
  type PlaceContribution,
  type PlaceName,
  type PlaceSignal,
  placeNames,
  type SettingsSectionContribution,
  type ShownPlace,
  type SidebarPlace,
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
export type {
  FeatureServices,
  ServiceFactory,
  ServiceLookup,
  ServiceTarget,
} from "./service-catalog.ts";
export { type ServiceKey, serviceKey } from "./service-key.ts";
export { createShell, type Shell, type ShellOptions } from "./shell.ts";
export { ShellError } from "./shell-error.ts";
export { PlacesList, type PlacesListProps } from "./sidebar/places-list.tsx";
export {
  SidebarResizeEdge,
  type SidebarResizeEdgeProps,
} from "./sidebar/sidebar-resize-edge.tsx";
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
export type { WorkspaceContext } from "./workspace-context.ts";
