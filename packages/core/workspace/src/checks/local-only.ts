import { connectorIsLocal, type ModelAlias, type Provider } from "@halonicjs/format";
import type { WorkspaceIssue } from "../load-workspace.ts";
import type { CheckContext } from "./check-context.ts";
import { isAliasName } from "./model-aliases.ts";
import { runsInHarness } from "./working-folders.ts";

/** The key path of a model setting, and how the message names its owner. */
interface ModelSetting {
  readonly file: string;
  readonly path: (string | number)[];
  /** Such as `Agent "clerk"`. */
  readonly owner: string;
  readonly model: string;
}

/** How every message ends: the two ways out. */
const turnOff = "or set privacy.localOnly: false in workspace.yaml";

/**
 * A workspace whose `workspace.yaml` sets `privacy.localOnly: true` keeps
 * everything on this computer (ADR `2026-11-08-local-first`). This reports
 * as an error each model alias, each `provider/model` setting and each
 * connector that would reach past it, and each agent that runs in a harness
 * program (Claude Code or Codex), because such a program sends the work to
 * its own cloud model. A provider is local when its file says `local: true`,
 * or when it is the mock model, as the engine counts it; a connector as
 * `connectorIsLocal` says. A provider no file has is left to the reference
 * checks.
 */
export function checkLocalOnly(context: CheckContext): WorkspaceIssue[] {
  const workspace = context.filesOf("workspace")[0];
  if (workspace === undefined || !workspace.value.privacy.localOnly) {
    return [];
  }
  const providers = new Map(
    context.filesOf("provider", null).map((file) => [file.value.id, file.value]),
  );
  const cloud = (provider: string): boolean => {
    const file = providers.get(provider);
    return file !== undefined && !providerIsLocal(file);
  };
  return [
    ...aliasIssues(context, cloud),
    ...modelSettingIssues(context, cloud),
    ...connectorIssues(context),
    ...harnessIssues(context),
  ];
}

/** The model aliases whose provider isn't local. */
function aliasIssues(
  context: CheckContext,
  cloud: (provider: string) => boolean,
): WorkspaceIssue[] {
  return aliasFiles(context).flatMap(({ file, key, aliases }) =>
    Object.entries(aliases)
      .filter(([, target]) => cloud(target.provider))
      .map(([alias, target]) => {
        const message = `Alias "${alias}" uses provider "${target.provider}", which isn't local, and the workspace is local only: point it at a local provider, ${turnOff}`;
        return context.error(file, [key, alias, "provider"], "local-only-model", message);
      }),
  );
}

/** The `provider/model` settings whose provider isn't local; an alias is checked where it is defined. */
function modelSettingIssues(
  context: CheckContext,
  cloud: (provider: string) => boolean,
): WorkspaceIssue[] {
  return modelSettings(context).flatMap((setting) => {
    const provider = setting.model.slice(0, setting.model.indexOf("/"));
    if (isAliasName(setting.model) || !cloud(provider)) {
      return [];
    }
    const message = `${setting.owner} uses model "${setting.model}", whose provider "${provider}" isn't local, and the workspace is local only: use a local model, ${turnOff}`;
    return [context.error(setting.file, setting.path, "local-only-model", message)];
  });
}

/** The connectors that aren't local, pointing at `local` when the file sets it. */
function connectorIssues(context: CheckContext): WorkspaceIssue[] {
  return context
    .filesOf("connector")
    .filter((connector) => !connectorIsLocal(connector.value))
    .map((connector) => {
      const path = connector.value.local === undefined ? ["transport"] : ["local"];
      const message = `Connector "${connector.value.id}" isn't local, and the workspace is local only: set local: true if it runs on this computer, ${turnOff}`;
      return context.error(connector.path, path, "local-only-connector", message);
    });
}

/** The agents that run in a harness program, which calls its own model, not the workspace's. */
function harnessIssues(context: CheckContext): WorkspaceIssue[] {
  return context
    .filesOf("agent")
    .filter(runsInHarness)
    .map((agent) => {
      const message = `Agent "${agent.value.id}" runs in ${agent.value.harness}, which sends its work to its own cloud model, and the workspace is local only: remove harness to run it in Halonic's own loop, ${turnOff}`;
      return context.error(agent.path, ["harness"], "local-only-harness", message);
    });
}

/** Whether a provider runs on this computer; the mock model always does. */
function providerIsLocal(provider: Provider): boolean {
  return provider.local || provider.type === "mock";
}

/** A file's model aliases, under its key. */
interface AliasFile {
  readonly file: string;
  readonly key: "aliases" | "models";
  readonly aliases: Readonly<Record<string, ModelAlias>>;
}

/** The files that define model aliases: `models.yaml` under `aliases`, a `hub.yaml` under `models`. */
function aliasFiles(context: CheckContext): AliasFile[] {
  return [
    ...context.filesOf("models").map((file) => ({
      file: file.path,
      key: "aliases" as const,
      aliases: file.value.aliases,
    })),
    ...context.filesOf("hub").map((file) => ({
      file: file.path,
      key: "models" as const,
      aliases: file.value.models,
    })),
  ];
}

/** Every setting that names a model: defaults, the session AI, agents and their methods. */
function modelSettings(context: CheckContext): ModelSetting[] {
  const settings: ModelSetting[] = [];
  const add = (
    file: string,
    path: (string | number)[],
    owner: string,
    model: string | undefined,
  ) => {
    if (model !== undefined) {
      settings.push({ file, path, owner, model });
    }
  };
  for (const workspace of context.filesOf("workspace")) {
    add(workspace.path, ["defaults", "model"], "The default model", workspace.value.defaults.model);
    add(workspace.path, ["assistant", "model"], "The session AI", workspace.value.assistant?.model);
  }
  for (const hub of context.filesOf("hub")) {
    add(hub.path, ["defaults", "model"], "The hub's default model", hub.value.defaults.model);
  }
  for (const agent of context.filesOf("agent")) {
    const name = agent.value.id;
    add(agent.path, ["model"], `Agent "${name}"`, agent.value.model);
    for (const [methodId, method] of Object.entries(agent.value.methods)) {
      add(agent.path, ["methods", methodId, "model"], `Method "${name}.${methodId}"`, method.model);
    }
  }
  return settings;
}
