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
  engineConnectionAnnouncements,
  type ShellEngine,
  type ShellEngineState,
} from "./engine/engine-connection.ts";
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
export {
  type ErrorAction,
  type ErrorContext,
  type ErrorMessage,
  errorMessageFor,
  type RulePlace,
} from "./errors/error-message.ts";
export { defineFeature, type Feature, type FeatureDefinition } from "./feature.ts";
export { phoneQuery, usePresentationFromWidth } from "./frame/frame-effects.ts";
export { ShellFrame, type ShellFrameProps } from "./frame/shell-frame.tsx";
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
export type {
  FeatureServices,
  ServiceFactory,
  ServiceLookup,
  ServiceTarget,
} from "./service-catalog.ts";
export { type ServiceKey, serviceKey } from "./service-key.ts";
export { createShell, type Shell, type ShellOptions } from "./shell.ts";
export { ShellError } from "./shell-error.ts";
export type { Studio } from "./studio.ts";
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
export { loadView, type ViewRef } from "./view.ts";
export type { WorkspaceContext } from "./workspace-context.ts";
