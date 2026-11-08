import type { Feature } from "./feature.ts";
import type { ServiceKey } from "./service-key.ts";
import { ShellError } from "./shell-error.ts";

/** Who provides a service: a feature id, or `null` for the app itself. */
type Provider = string | null;

/**
 * Checks that the features fit together and returns them so that every
 * feature comes after the features whose services it needs. Otherwise the
 * order given is kept, so the result is the same on every run.
 *
 * @throws ShellError for a duplicate feature id, a service provided twice, a
 *   needed service nobody provides, or features that need each other in a cycle
 */
export function orderFeatures(
  features: readonly Feature[],
  hostServices: readonly ServiceKey<unknown>[],
): Feature[] {
  const byId = indexById(features);
  const providers = indexProviders(features, hostServices);
  for (const feature of features) {
    for (const key of feature.needs) {
      if (!providers.has(key.name)) {
        throw new ShellError(
          `The feature "${feature.id}" needs the service "${key.name}", but nothing provides it. Add the feature that provides it, or list it in the app's hostServices.`,
        );
      }
    }
  }

  const ordered: Feature[] = [];
  const done = new Set<string>();
  const path: string[] = [];
  const visit = (feature: Feature): void => {
    if (done.has(feature.id)) {
      return;
    }
    if (path.includes(feature.id)) {
      const cycle = [...path.slice(path.indexOf(feature.id)), feature.id].join(" → ");
      throw new ShellError(
        `Features need each other's services in a cycle: ${cycle}. Move the shared part into one feature, or into a host service.`,
      );
    }
    path.push(feature.id);
    for (const key of feature.needs) {
      const provider = providers.get(key.name);
      const providerFeature =
        provider === null || provider === undefined ? undefined : byId.get(provider);
      if (providerFeature !== undefined) {
        visit(providerFeature);
      }
    }
    path.pop();
    done.add(feature.id);
    ordered.push(feature);
  };
  for (const feature of features) {
    visit(feature);
  }
  return ordered;
}

function indexById(features: readonly Feature[]): Map<string, Feature> {
  const byId = new Map<string, Feature>();
  for (const feature of features) {
    if (byId.has(feature.id)) {
      throw new ShellError(
        `Two features have the id "${feature.id}". Feature ids must be unique; rename one of them.`,
      );
    }
    byId.set(feature.id, feature);
  }
  return byId;
}

function indexProviders(
  features: readonly Feature[],
  hostServices: readonly ServiceKey<unknown>[],
): Map<string, Provider> {
  const providers = new Map<string, Provider>();
  const add = (name: string, provider: Provider): void => {
    const existing = providers.get(name);
    if (existing !== undefined) {
      throw new ShellError(
        `The service "${name}" is provided by both ${describeProvider(existing)} and ${describeProvider(provider)}. Exactly one may provide it.`,
      );
    }
    providers.set(name, provider);
  };
  for (const key of hostServices) {
    add(key.name, null);
  }
  for (const feature of features) {
    for (const key of feature.provides) {
      add(key.name, feature.id);
    }
  }
  return providers;
}

function describeProvider(provider: Provider): string {
  if (provider === null) {
    return "the app (hostServices)";
  }
  return `the feature "${provider}"`;
}
