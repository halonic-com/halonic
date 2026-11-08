import type { Feature } from "./feature.ts";
import type { ServiceKey } from "./service-key.ts";
import { ShellError } from "./shell-error.ts";

/** Looks up services while a service is being built. */
export interface ServiceLookup {
  /**
   * The service for a key.
   *
   * @throws ShellError when the feature doesn't list the key in `needs`
   */
  get<Service>(key: ServiceKey<Service>): Service;
}

/**
 * Builds a service for one open workspace. It runs each time a workspace
 * opens, after the services it needs exist.
 */
export type ServiceFactory<Service> = (services: ServiceLookup) => Service;

/** The `studio.services` point: how a feature provides its services. */
export interface FeatureServices {
  /**
   * Gives the factory for a service the feature lists in `provides`.
   *
   * @throws ShellError when the key isn't in `provides`, or is provided twice
   */
  provide<Service>(key: ServiceKey<Service>, factory: ServiceFactory<Service>): void;
}

/**
 * Where built services go: the service registry of one open workspace.
 * `ServiceRegistry` from `@halonicjs/app` fits this shape.
 */
export interface ServiceTarget {
  /** Adds a built service. */
  provide<Service>(key: ServiceKey<Service>, service: Service): unknown;
  /** The service for a key; throws when it's missing. */
  get<Service>(key: ServiceKey<Service>): Service;
  /** Whether the key is there. */
  has(key: ServiceKey<unknown>): boolean;
}

interface Entry {
  readonly feature: Feature;
  readonly key: ServiceKey<unknown>;
  readonly factory: ServiceFactory<unknown>;
}

/** Collects the service factories features give while they register. */
export class ServiceCatalog {
  private readonly entries: Entry[] = [];

  /** The `studio.services` point for one feature. `isOpen` turns false when its `register` returns. */
  pointFor(feature: Feature, isOpen: () => boolean): FeatureServices {
    return {
      provide: (key, factory) => {
        if (!isOpen()) {
          throw new ShellError(
            `The feature "${feature.id}" provided "${key.name}" after register returned. Provide services inside register.`,
          );
        }
        if (!feature.provides.some((listed) => listed.name === key.name)) {
          throw new ShellError(
            `The feature "${feature.id}" provides "${key.name}" but doesn't list it in provides. Add it there.`,
          );
        }
        if (this.entries.some((entry) => entry.key.name === key.name)) {
          throw new ShellError(`The feature "${feature.id}" provides "${key.name}" twice.`);
        }
        this.entries.push({ feature, key, factory: factory as ServiceFactory<unknown> });
      },
    };
  }

  /**
   * Checks that the feature gave a factory for everything in its `provides`.
   *
   * @throws ShellError naming the first service it didn't provide
   */
  checkProvided(feature: Feature): void {
    for (const key of feature.provides) {
      if (!this.entries.some((entry) => entry.key.name === key.name)) {
        throw new ShellError(
          `The feature "${feature.id}" lists "${key.name}" in provides but never calls studio.services.provide for it.`,
        );
      }
    }
  }

  /**
   * Builds every feature's services into one workspace's registry, in
   * dependency order. Features are built in the order they registered, so
   * the services in their `needs` already exist. Within one feature, a
   * factory that reads another of the feature's own services builds that one
   * first.
   *
   * @throws ShellError when a host service is missing from the target, or
   *   when a feature's own services need each other in a cycle
   */
  instantiate(target: ServiceTarget, hostServices: readonly ServiceKey<unknown>[]): void {
    for (const key of hostServices) {
      if (!target.has(key)) {
        throw new ShellError(
          `The host service "${key.name}" is missing from this workspace. Provide it before building the features' services.`,
        );
      }
    }
    const built = new Set<Entry>();
    const building: Entry[] = [];
    const build = (entry: Entry): void => {
      if (built.has(entry)) {
        return;
      }
      if (building.includes(entry)) {
        const cycle = [...building.slice(building.indexOf(entry)), entry]
          .map((step) => `"${step.key.name}"`)
          .join(" -> ");
        throw new ShellError(
          `The feature "${entry.feature.id}" has services that need each other: ${cycle}. Break the cycle.`,
        );
      }
      building.push(entry);
      const lookup = lookupFor(entry.feature, target, (key) => {
        const own = this.entries.find(
          (other) => other.feature === entry.feature && other.key.name === key.name,
        );
        if (own) {
          build(own);
        }
      });
      target.provide(entry.key, entry.factory(lookup));
      building.pop();
      built.add(entry);
    };
    for (const entry of this.entries) {
      build(entry);
    }
  }
}

/**
 * A lookup into one workspace's services, limited to what the feature lists
 * in `needs` and `provides`. `beforeGet` runs before each allowed lookup;
 * `instantiate` uses it to build the feature's own services on demand.
 */
export function lookupFor(
  feature: Feature,
  target: ServiceTarget,
  beforeGet?: (key: ServiceKey<unknown>) => void,
): ServiceLookup {
  return {
    get: <Service>(key: ServiceKey<Service>): Service => {
      const listed =
        feature.needs.some((need) => need.name === key.name) ||
        feature.provides.some((own) => own.name === key.name);
      if (!listed) {
        throw new ShellError(
          `The feature "${feature.id}" asked for the service "${key.name}" but doesn't list it in needs. Add it there.`,
        );
      }
      beforeGet?.(key);
      return target.get(key);
    },
  };
}
