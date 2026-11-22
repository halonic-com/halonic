import { nearMatch } from "@halonicjs/std";
import type { WorkspaceIssue } from "../load-workspace.ts";
import type { CheckContext } from "./check-context.ts";

/**
 * Whether a model setting names an alias. `provider/model` names a model
 * directly, so it isn't looked up among the aliases.
 */
export function isAliasName(model: string): boolean {
  return !model.includes("/");
}

/**
 * The model aliases a file in a hub (`null`: the root) can use: those of
 * `models.yaml`, and the hub's own from its `hub.yaml`. None come from a file
 * that didn't parse.
 */
export function modelAliasesOf(context: CheckContext, hub: string | null): Set<string> {
  const aliases = new Set<string>();
  for (const models of context.filesOf("models")) {
    for (const alias of Object.keys(models.value.aliases)) {
      aliases.add(alias);
    }
  }
  if (hub !== null) {
    for (const hubFile of context.filesOf("hub", hub)) {
      for (const alias of Object.keys(hubFile.value.models)) {
        aliases.add(alias);
      }
    }
  }
  return aliases;
}

/**
 * Whether `models.yaml` was read but failed its own checks. Any alias may be
 * in it then, so "unknown alias" would send the user to the wrong file; its
 * own errors say what to fix (HAL-14261).
 */
export function modelsFileFailed(context: CheckContext): boolean {
  return context.hasReadKind("models") && context.filesOf("models").length === 0;
}

/**
 * What validate says about an alias in `models.yaml` or a `hub.yaml` on a
 * provider no file names. Its first sentence is the one a run that stops for
 * the same cause says (C637, HAL-15841), and it ends with the fix, as the run
 * view's banner for the same cause does, so validate isn't the one place that
 * leaves it out (C618, HAL-15709), and both files' aliases read the same
 * (C638, HAL-15830).
 */
export function unknownProviderMessage(
  alias: string,
  provider: string,
  providers: Set<string>,
): string {
  const near = nearMatch(provider, providers);
  const fix =
    near === undefined
      ? `Add providers/${provider}.yaml, or point the model alias ${alias} at a provider the workspace has.`
      : `Did you mean ${near}?`;
  return `The model alias ${alias} names the provider ${provider}, which the workspace doesn't have. ${fix}`;
}

/**
 * The aliases in `models.yaml`: each one's provider must exist, and each
 * alias it falls back to too. The messages are the old loader's, except the
 * unknown provider's, which is the run's ({@link unknownProviderMessage}). A provider
 * whose file failed its own checks isn't unknown: that file's error says
 * what to fix (HAL-14260, HAL-14261).
 */
export function checkModelsFile(context: CheckContext): WorkspaceIssue[] {
  const providers = context.nameableIds("provider", null);
  const issues: WorkspaceIssue[] = [];
  for (const models of context.filesOf("models")) {
    const aliases = models.value.aliases;
    for (const [alias, target] of Object.entries(aliases)) {
      const provider = target.provider;
      if (!providers.has(provider)) {
        const message = unknownProviderMessage(alias, provider, providers);
        const path = ["aliases", alias, "provider"];
        issues.push(context.error(models.path, path, "unknown-provider", message));
      }
      target.fallback.forEach((fallback, index) => {
        if (!Object.hasOwn(aliases, fallback)) {
          const message = `Alias "${alias}" falls back to unknown alias "${fallback}"`;
          const path = ["aliases", alias, "fallback", index];
          issues.push(context.error(models.path, path, "unknown-fallback", message));
        }
      });
    }
  }
  return issues;
}

/** The assistant model in `workspace.yaml` (`assistant.model`) must be a known alias. */
export function checkSessionModel(context: CheckContext): WorkspaceIssue[] {
  if (modelsFileFailed(context)) {
    return [];
  }
  const aliases = modelAliasesOf(context, null);
  return context.filesOf("workspace").flatMap((workspace) => {
    const model = workspace.value.assistant?.model;
    if (model === undefined || !isAliasName(model) || aliases.has(model)) {
      return [];
    }
    const message = `The assistant model (assistant.model) uses "${model}", which isn't an alias in models.yaml.`;
    return [context.error(workspace.path, ["assistant", "model"], "unknown-model-alias", message)];
  });
}
