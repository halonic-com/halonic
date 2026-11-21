// Where a workspace names models: the files that define model aliases, and
// every setting that names a model. The local-only and provider checks read
// both (HAL-14301).

import type { ModelAlias } from "@halonicjs/format";
import type { CheckContext } from "./check-context.ts";

/** The key path of a model setting, and how the message names its owner. */
export interface ModelSetting {
  readonly file: string;
  readonly path: (string | number)[];
  /** Such as `Agent "clerk"`. */
  readonly owner: string;
  readonly model: string;
}

/** A file's model aliases, under its key. */
export interface AliasFile {
  readonly file: string;
  readonly key: "aliases" | "models";
  readonly aliases: Readonly<Record<string, ModelAlias>>;
}

/** The files that define model aliases: `models.yaml` under `aliases`, a `hub.yaml` under `models`. */
export function aliasFiles(context: CheckContext): AliasFile[] {
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
export function modelSettings(context: CheckContext): ModelSetting[] {
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
