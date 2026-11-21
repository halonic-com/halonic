import { nearMatch } from "@halonicjs/std";
import type { WorkspaceIssue } from "../load-workspace.ts";
import type { CheckContext } from "./check-context.ts";
import { isAliasName } from "./model-aliases.ts";
import { aliasFiles, modelSettings } from "./model-settings.ts";

/**
 * The provider a hub's model alias or a `provider/model` setting names must
 * have a file in `providers/`, as one in `models.yaml` must
 * ({@link checkModelsFile}): otherwise the run stops on it (HAL-14301, Nina's
 * C340 check). A provider whose file failed its own checks isn't unknown:
 * that file's error says what to fix. An agent whose harness starts a program
 * passes its model to that program as written, so its provider isn't checked.
 */
export function checkModelProviders(context: CheckContext): WorkspaceIssue[] {
  const providers = context.nameableIds("provider", null);
  const hubAliases = aliasFiles(context)
    .filter(({ key }) => key === "models")
    .flatMap(({ file, aliases }) =>
      Object.entries(aliases)
        .filter(([, target]) => !providers.has(target.provider))
        .map(([alias, target]) => {
          const near = nearMatch(target.provider, providers);
          const fix =
            near === undefined
              ? `add providers/${target.provider}.yaml, or use a provider the workspace has`
              : `Did you mean ${near}?`;
          const message = `Alias "${alias}" uses unknown provider "${target.provider}": ${fix}`;
          return context.error(file, ["models", alias, "provider"], "unknown-provider", message);
        }),
    );
  const shorthands = modelSettings(context).flatMap((setting) => {
    if (setting.startsAProgram || isAliasName(setting.model)) {
      return [];
    }
    const slash = setting.model.indexOf("/");
    const provider = setting.model.slice(0, slash);
    if (providers.has(provider)) {
      return [];
    }
    const near = nearMatch(provider, providers);
    const fix =
      near === undefined
        ? `add providers/${provider}.yaml, or use a provider the workspace has`
        : `Did you mean ${near}${setting.model.slice(slash)}?`;
    const message = `${setting.owner} uses model "${setting.model}", whose provider "${provider}" the workspace doesn't have: ${fix}`;
    return [context.error(setting.file, setting.path, "unknown-provider", message)];
  });
  return [...hubAliases, ...shorthands];
}
