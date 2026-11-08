import type { Feature } from "./feature.ts";
import { orderFeatures } from "./feature-graph.ts";
import { ServiceCatalog, type ServiceTarget } from "./service-catalog.ts";
import type { ServiceKey } from "./service-key.ts";
import { ShellError } from "./shell-error.ts";
import type { Studio } from "./studio.ts";

/** What the app hands to {@link createShell}. */
export interface ShellOptions {
  /** Every feature of the Studio, usually the generated feature list. */
  readonly features: readonly Feature[];
  /** Services the app itself provides to every workspace, such as the workspace service. */
  readonly hostServices?: readonly ServiceKey<unknown>[];
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
  };
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
  for (const feature of features) {
    registerFeature(feature, catalog);
  }
  return {
    features,
    services: {
      instantiate: (target) => catalog.instantiate(target, hostServices),
    },
  };
}

function registerFeature(feature: Feature, catalog: ServiceCatalog): void {
  let open = true;
  const isOpen = (): boolean => open;
  const studio: Studio = {
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
