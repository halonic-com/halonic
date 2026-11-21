// The doctor's Models line for a workspace: the providers its aliases use,
// with what the resource report and the stored keys found for each.

import { type ModelProviderState, type ModelsLine, modelsLine } from "./doctor-models-line.ts";
import type { DoctorProvider, DoctorWorkspace } from "./doctor-service.ts";
import { type TimedOutLine, timedOut, timedOutLine } from "./doctor-time-limit.ts";
import type { ProviderModels, Resources } from "./resource-report.ts";

/**
 * The Models line, or none without model aliases. It needs the stored keys,
 * and the resource report's loaded models when a provider runs on this
 * computer, so it ran over when one of those did.
 */
export function workspaceModels(
  workspace: DoctorWorkspace,
  resources: Resources | typeof timedOut,
  keys: ReadonlyMap<string, boolean | "unreadable"> | typeof timedOut,
): ModelsLine | TimedOutLine<"models"> | undefined {
  if (workspace.aliases.length === 0) return undefined;
  const local = workspace.providers.some((provider) => provider.runs === "on-this-computer");
  if (keys === timedOut || (local && resources === timedOut)) return timedOutLine("models");
  const loaded = resources === timedOut ? [] : resources.models;
  const providers = workspace.providers.map((provider) => providerState(provider, loaded, keys));
  return modelsLine(providers, workspace.aliases);
}

/** A provider as the Models line takes it, with what the report and the secrets found. */
function providerState(
  provider: DoctorProvider,
  loaded: readonly ProviderModels[],
  keys: ReadonlyMap<string, boolean | "unreadable">,
): ModelProviderState {
  const { provider: id, name } = provider;
  switch (provider.runs) {
    case "on-this-computer": {
      const found = loaded.find((models) => models.provider === id);
      if (found === undefined) {
        throw new Error(
          `The provider ${id} runs on this computer, but the resource report has no LoadedModelSource for it.`,
        );
      }
      return {
        provider: id,
        name,
        runs: provider.runs,
        address: provider.address,
        models: found.models,
      };
    }
    case "with-a-key":
      return {
        provider: id,
        name,
        runs: provider.runs,
        secret: provider.secret,
        keyStored: keys.get(id) ?? false,
      };
    case "without-a-key":
      return { provider: id, name, runs: provider.runs };
  }
}
