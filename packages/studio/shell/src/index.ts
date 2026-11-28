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
export { type AnnouncerTimers, systemTimers } from "./announcer/timers.ts";
export {
  type BadgeRegistry,
  type BadgeState,
  createBadgeRegistry,
  trustBadgePriority,
} from "./badges/badge-registry.ts";
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
  NameAndHubRow,
  type NameAndHubRowProps,
  NewItemNote,
  type NewItemNoteProps,
} from "./dialogs/new-item-parts.tsx";
export {
  createShellEngine,
  type EngineConnectionEvent,
  type EngineConnectionListener,
  type ShellEngine,
  type ShellEngineState,
} from "./engine/engine-connection.ts";
export {
  EngineFailedWindow,
  type EngineFailedWindowProps,
  type JustUpdated,
} from "./engine/engine-failed-window.tsx";
export { EngineLine, type EngineLineProps } from "./engine/engine-line.tsx";
export { EngineNotAnswering } from "./engine/engine-not-answering.ts";
export {
  type EngineRestartOptions,
  stoppedRunsText,
  watchEngineRestart,
} from "./engine/engine-restarted-toast.ts";
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
export { EngineStarting } from "./engine/engine-starting.ts";
export {
  type EngineWords,
  engineWords,
  engineWordsOf,
  type StudioHost,
} from "./engine/engine-words.ts";
export { isFolderNotOpen } from "./engine/folder-not-open.ts";
export {
  isUntrustedRefusal,
  WorkspaceUntrusted,
  workspaceUntrustedCode,
} from "./engine/workspace-untrusted.ts";
export {
  copyDetailsWords,
  detailsOf,
  ErrorWithDetails,
  rawDetailsOf,
} from "./errors/copy-details-words.ts";
export {
  type ErrorAction,
  type ErrorContext,
  type ErrorMessage,
  engineReasonFor,
  errorMessageFor,
  errorReasonFor,
  isUnexplained,
  itemGoneWords,
  type RulePlace,
  unexplainedReason,
} from "./errors/error-message.ts";
export { failureLine, lowerAfterColon, reasonAfterColon } from "./errors/failure-line.ts";
export {
  StartFailedCallout,
  type StartFailedCalloutProps,
  startFailedWords,
} from "./errors/start-failed-callout.tsx";
export { type StartFailure, startFailureOf, withFullStop } from "./errors/start-failure.ts";
export { TryAgainLater } from "./errors/try-again-later.ts";
export { defineFeature, type Feature, type FeatureDefinition } from "./feature.ts";
export {
  focusFellToPage,
  useRefocusWhenGone,
  useTellWhenGoneWithFocus,
} from "./focus/refocus-when-gone.ts";
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
export {
  SAVING_AFTER_MS,
  StatusBarSaveNote,
  type StatusBarSaveNoteProps,
} from "./frame/status-bar-save-note.tsx";
export { type StripProps, Strips, type StripsProps } from "./frame/strips.tsx";
export { firstLoad, type HomeCardSource } from "./home/first-load.ts";
export type { HomeCardProps } from "./home/home-page.tsx";
export { HomeSectionEmpty } from "./home/home-section.tsx";
export {
  type ItemCardTaker,
  ItemCardTakers,
  useItemCardTaker,
} from "./item-page/item-card-takers.ts";
export { ItemHeader, type ItemHeaderProps } from "./item-page/item-header.tsx";
export {
  ItemPage,
  type ItemPageChat,
  type ItemPageHandle,
  type ItemPageProps,
} from "./item-page/item-page.tsx";
export { NameField, type NameFieldProps } from "./item-page/name-field.tsx";
export { RenameSheet, type RenameSheetProps, renameSheetWords } from "./item-page/rename-sheet.tsx";
export {
  ChangeMark,
  type ChangeMarkBusy,
  type ChangeMarkKind,
  type ChangeMarkProps,
  changeMarkSelector,
} from "./item-review/change-mark.tsx";
export { changesDecided } from "./item-review/changes-decided.ts";
export {
  changeMarkKindOf,
  ItemChangeMark,
} from "./item-review/item-change-mark.tsx";
export type {
  ItemChangeToReview,
  ItemReview,
  ItemReviewDecision,
  ItemReviewHost,
  ItemReviewTarget,
} from "./item-review/item-review-api.ts";
export {
  ItemReviewBar,
  type ItemReviewBarProps,
  type ItemReviewBusy,
} from "./item-review/item-review-bar.tsx";
export { itemReviewWords } from "./item-review/item-review-words.ts";
export { positionWithin, steppedPosition } from "./item-review/review-position.ts";
export {
  type ItemReviewBusyOn,
  type ItemReviewMarks,
  type ItemReviewParts,
  type ItemReviewState,
  type ReviewedItem,
  useItemReview,
} from "./item-review/use-item-review.tsx";
export {
  allFilter,
  type OverviewChip,
  type OverviewHub,
  type OverviewItem,
  type OverviewSection,
  type OverviewShared,
  type OverviewView,
  overviewChips,
  overviewSections,
  sharedFilter,
} from "./overview/overview-model.ts";
export {
  type OverviewFailure,
  OverviewPage,
  type OverviewPageProps,
  type OverviewWords,
} from "./overview/overview-page.tsx";
export {
  type FocusTarget,
  focusRow,
  targetAfterRemoving,
  visibleRowIds,
} from "./overview/row-focus.ts";
export { PageBackLinkSlot } from "./page/back-link-slot.tsx";
export { copyDetails, useCopyDetails, useCopyDetailsInPlace } from "./page/copy-details.ts";
export { ItemGone, type ItemGoneProps } from "./page/item-gone.tsx";
export {
  connectFrom,
  NoConnections,
  type NoConnectionsProps,
  noConnectionsWords,
} from "./page/no-connections.tsx";
export { PageErrorBoundary, type PageErrorBoundaryProps } from "./page/page-error-boundary.tsx";
export { pageStoppedWords } from "./page/page-stopped.tsx";
export { unreachableWords } from "./page/page-unreachable.tsx";
// biome-ignore lint/performance/noReExportAll: keeps the barrel under the file-size limit; the names are listed in that file
export * from "./palette-exports.ts";
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
export type { PanelWindowViewProps } from "./panels/panel-window-slot.tsx";
// biome-ignore lint/performance/noReExportAll: keeps the barrel under the file-size limit; the names are listed in that file
export * from "./phone-exports.ts";
// biome-ignore lint/performance/noReExportAll: keeps the barrel under the file-size limit; the names are listed in that file
export * from "./points-exports.ts";
export { brokenFileItem, brokenFileWords, useBrokenFiles } from "./problems/broken-file-rows.ts";
export {
  FilesWithErrorsService,
  type FilesWithErrorsSource,
  type FileWithErrors,
  type FileWithErrorsKind,
  fileWithErrorsKinds,
} from "./problems/files-with-errors.ts";
export {
  type FilesWithErrorsReading,
  filesWithErrorsReading,
  useFilesWithErrors,
  useFilesWithErrorsReading,
} from "./problems/use-files-with-errors.ts";
export {
  type RailDotMotion,
  railDotMotionAttribute,
  railDotMotions,
} from "./rail/rail-dot-motion.ts";
export {
  type ChildProcessUsage,
  type EngineResourceReport,
  type LoadedModel,
  readResourceReport,
} from "./resources/resource-report.ts";
export {
  ResourceStatusItem,
  type ResourceStatusItemProps,
  resourceItemRefreshMs,
} from "./resources/resource-status-item.tsx";
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
export {
  type AutoSaved,
  SAVE_PAUSE_MS,
  useAutoSaved,
  useReportNotSaved,
} from "./save/use-auto-saved.ts";
export {
  isInWorkspaceContent,
  workspaceContentAttribute,
  workspaceContentProps,
} from "./save/workspace-content.ts";
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
export {
  type ChatSecretHold,
  chatSecretHold,
  type SecretHold,
  type SecretHoldWhere,
  secretHold,
} from "./secret-hold/secret-hold.ts";
export {
  type FeatureServices,
  limitedLookup,
  type OpenLookup,
  type ServiceFactory,
  type ServiceLookup,
  type ServiceTarget,
} from "./service-catalog.ts";
export { type ServiceKey, serviceKey } from "./service-key.ts";
export { focusSectionHeading, sectionHeading, sectionHeadingLevel } from "./settings/headings.ts";
export {
  SettingsDialog,
  type SettingsDialogProps,
  type SettingsSectionProps,
} from "./settings/settings-dialog.tsx";
export {
  type SettingsGroup,
  type SettingsGroupsInput,
  type SettingsPlace,
  type SettingsSurface,
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
  letterMark,
  type SwitcherWorkspace,
  WorkspaceSwitcher,
  type WorkspaceSwitcherProps,
} from "./sidebar/workspace-switcher.tsx";
export type { Studio } from "./studio.ts";
export { focusPageHeading, pageHeading } from "./tabs/history-moves.ts";
export { mountedTabIds, mountedTabLimit } from "./tabs/mounted-tabs.ts";
export { type GoneItem, TabPages, type TabPagesProps } from "./tabs/tab-pages.tsx";
export {
  currentLocation,
  homeLocation,
  type OpenedTab,
  type OpenInNewTabOptions,
  reopenableTabs,
  type TabLocation,
  TabSet,
  type TabSetState,
  type WindowTab,
} from "./tabs/tab-set.ts";
export { useWindowKeys, type WindowKeysOptions } from "./tabs/use-window-keys.ts";
export { type PressedKey, type WindowKey, windowKeyFor } from "./tabs/window-keys.ts";
export { WindowTabStrip, type WindowTabStripProps } from "./tabs/window-tab-strip.tsx";
export { HistoryButtons, type HistoryButtonsProps } from "./title-bar/history-buttons.tsx";
export { TitleBarBrand } from "./title-bar/title-bar-brand.tsx";
export { loadView, type ViewRef } from "./view.ts";
export {
  cantOpenProblem,
  cantOpenWords,
  cantReopenProblem,
  engineWaitMs,
  offersRemoveFromRecent,
  profileInsideFix,
  type WelcomeOpenProblem,
} from "./welcome/cant-open.ts";
export type {
  LiteCheckResult,
  StartCause,
  StartPhase,
  StartReport,
  StartState,
  WelcomeStart,
} from "./welcome/start-status.ts";
export {
  removeFromRecentLabel,
  Welcome,
  type WelcomeProps,
  type WelcomeRecentList,
} from "./welcome/welcome.tsx";
export {
  sampleTag,
  WELCOME_RECENT_ROWS,
  type WelcomeRecentWorkspace,
} from "./welcome/welcome-recent.tsx";
export { cantCreateSampleLine, type WelcomeSampleProblem } from "./welcome/welcome-sample.tsx";
export { WelcomeWindow, type WelcomeWindowProps } from "./welcome/welcome-window.tsx";
export {
  FocusedWindow,
  type FocusedWindowProps,
  focusedFrameClass,
  focusedPanelClass,
  focusedWindowTitle,
  focusedWindowWords,
  type MountedFocusedWindow,
  mountFocusedWindow,
} from "./window/focused-window.tsx";
export {
  type ItemPageSectionViewProps,
  SECTION_ADD_STEP,
  type SectionsProps,
} from "./window/item-page-sections.tsx";
export type { ItemPageSectionListing, ItemViewProps } from "./window/item-view.tsx";
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
export {
  type StudioSwitcher,
  StudioWindow,
  type StudioWindowProps,
  type WindowActions,
} from "./window/studio-window.tsx";
export { StudioWorkspace, type StudioWorkspaceOptions } from "./window/studio-workspace.ts";
export type { ChosenFormat } from "./window/window-format.tsx";
export type {
  PanelWindowControl,
  SettingsSectionName,
  ShownInWindow,
  ShownPage,
  WorkspaceContext,
} from "./workspace-context.ts";
