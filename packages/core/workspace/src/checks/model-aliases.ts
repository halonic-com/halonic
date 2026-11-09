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
 * The aliases in `models.yaml`: each one's provider must exist, and each
 * alias it falls back to too. The messages are the old loader's.
 */
export function checkModelsFile(context: CheckContext): WorkspaceIssue[] {
  const providers = context.idsOf("provider", null);
  const issues: WorkspaceIssue[] = [];
  for (const models of context.filesOf("models")) {
    const aliases = models.value.aliases;
    for (const [alias, target] of Object.entries(aliases)) {
      if (!providers.has(target.provider)) {
        const message = `Alias "${alias}" uses unknown provider "${target.provider}"`;
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

/** The model the session AI in `workspace.yaml` starts with must be a known alias. */
export function checkSessionModel(context: CheckContext): WorkspaceIssue[] {
  const aliases = modelAliasesOf(context, null);
  return context.filesOf("workspace").flatMap((workspace) => {
    const model = workspace.value.assistant?.model;
    if (model === undefined || !isAliasName(model) || aliases.has(model)) {
      return [];
    }
    const message = `The session AI uses unknown model alias "${model}"`;
    return [context.error(workspace.path, ["assistant", "model"], "unknown-model-alias", message)];
  });
}
