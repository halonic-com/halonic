// The public API of @halonicjs/studio-shell. Everything else in src/ is internal.
export { defineFeature, type Feature, type FeatureDefinition } from "./feature.ts";
export type { CommandContributions, CommandPoints } from "./points/command-points.ts";
export type {
  CommandContribution,
  KeybindingContribution,
  PersistContribution,
  PersistedSession,
  SearchProviderContribution,
  SearchResult,
} from "./points/commands.ts";
export type {
  BarItemContribution,
  CardContribution,
  PanelWindowContribution,
  PhoneBarContribution,
  SettingsSectionContribution,
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
export { loadView, type ViewRef } from "./view.ts";
export type { WorkspaceContext } from "./workspace-context.ts";
