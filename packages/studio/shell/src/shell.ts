import { type Announcer, createAnnouncer } from "./announcer/announcer.ts";
import type { AnnouncerTimers } from "./announcer/timers.ts";
import type { Feature } from "./feature.ts";
import { orderFeatures } from "./feature-graph.ts";
import { type CommandContributions, CommandStores } from "./points/command-points.ts";
import { type FrameContributions, FrameStores } from "./points/frame-points.ts";
import type { KeyboardPlatform } from "./points/keybindings.ts";
import { type LayoutContributions, LayoutStores } from "./points/layout-points.ts";
import { lookupFor, ServiceCatalog, type ServiceTarget } from "./service-catalog.ts";
import type { ServiceKey } from "./service-key.ts";
import { ShellError } from "./shell-error.ts";
import type { Studio } from "./studio.ts";
import type { WorkspaceContext } from "./workspace-context.ts";

/** What the app hands to {@link createShell}. */
export interface ShellOptions {
  /** Every feature of the Studio, usually the generated feature list. */
  readonly features: readonly Feature[];
  /** Services the app itself provides to every workspace, such as the workspace service. */
  readonly hostServices?: readonly ServiceKey<unknown>[];
  /**
   * The operating system the Studio runs on. A keybinding's `Mod` means `Cmd`
   * on `"macos"` and `Ctrl` elsewhere. Leave it out and `Mod` means `Ctrl`.
   */
  readonly platform?: KeyboardPlatform;
  /** The timers the window's announcer uses; tests pass fake ones. Defaults to the system's. */
  readonly timers?: AnnouncerTimers;
}

/** The registered features and everything they contributed. */
export interface Shell {
  /** The features, each after the features whose services it needs. */
  readonly features: readonly Feature[];
  /** Builds the features' services for one open workspace. */
  readonly services: {
    /**
     * Builds every feature's services into a workspace's registry. Call it
     * once per workspace, after the host services are in it.
     *
     * @throws ShellError when a host service is missing from the target
     */
    instantiate(target: ServiceTarget): void;
    /**
     * The context for one feature's callbacks in a workspace: its services,
     * limited to what the feature lists in `needs` and `provides`.
     *
     * @throws ShellError when no feature has this id
     */
    contextFor(featureId: string, target: ServiceTarget): WorkspaceContext;
  };
  /** The window's screen reader announcements, shared by every workspace in it. */
  readonly announcer: Announcer;
  /** Everything the features contributed, for the shell's layout. */
  readonly contributions: LayoutContributions & FrameContributions & CommandContributions;
}

/**
 * Checks the features, registers each one in dependency order and returns
 * the result. Nothing is half-registered: any problem throws.
 *
 * @throws ShellError when the features don't fit together or a `register` fails
 *
 * @example
 * const shell = createShell({ features: [agentsFeature, routinesFeature], hostServices: [WorkspaceService] });
 */
export function createShell(options: ShellOptions): Shell {
  const hostServices = options.hostServices ?? [];
  const features = orderFeatures(options.features, hostServices);
  const catalog = new ServiceCatalog();
  const layout = new LayoutStores();
  const frame = new FrameStores();
  const commands = new CommandStores(options.platform);
  for (const feature of features) {
    registerFeature(feature, catalog, { layout, frame, commands });
  }
  layout.check();
  commands.check();
  const announcer =
    options.timers === undefined ? createAnnouncer() : createAnnouncer({ timers: options.timers });
  return {
    features,
    announcer,
    services: {
      instantiate: (target) => catalog.instantiate(target, hostServices),
      contextFor: (featureId, target) => ({
        services: lookupFor(findFeature(features, featureId), target),
        announcer,
      }),
    },
    contributions: {
      ...layout.contributions(),
      ...frame.contributions(),
      ...commands.contributions(),
    },
  };
}

interface PointStores {
  readonly layout: LayoutStores;
  readonly frame: FrameStores;
  readonly commands: CommandStores;
}

function registerFeature(feature: Feature, catalog: ServiceCatalog, stores: PointStores): void {
  let open = true;
  const isOpen = (): boolean => open;
  const guard = (pointName: string): void => {
    if (!open) {
      throw new ShellError(
        `The feature "${feature.id}" called ${pointName} after register returned. Add contributions inside register.`,
      );
    }
  };
  const studio: Studio = {
    ...stores.layout.pointsFor(feature.id, guard),
    ...stores.frame.pointsFor(feature.id, guard),
    ...stores.commands.pointsFor(feature.id, guard),
    services: catalog.pointFor(feature, isOpen),
  };
  try {
    feature.register(studio);
  } catch (error) {
    if (error instanceof ShellError) {
      throw error;
    }
    throw new ShellError(
      `The feature "${feature.id}" failed to register: ${describeError(error)}`,
      {
        cause: error,
      },
    );
  } finally {
    open = false;
  }
  catalog.checkProvided(feature);
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function findFeature(features: readonly Feature[], featureId: string): Feature {
  const feature = features.find((candidate) => candidate.id === featureId);
  if (feature === undefined) {
    throw new ShellError(`No feature has the id "${featureId}".`);
  }
  return feature;
}
