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
  /**
   * How the setting uses its model, read after the model's name: such as
   * `used by the agent clerk` (C665 row 71).
   */
  readonly role: string;
  readonly model: string;
  /**
   * Whether an agent's harness starts a program (any but `halonic`): that
   * program gets the model as written, not through `providers/`
   * (`engine.harness-model-alias`). False for every setting but an agent's.
   */
  readonly startsAProgram: boolean;
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
    { owner, role }: Pick<ModelSetting, "owner" | "role">,
    model: string | undefined,
    startsAProgram = false,
  ) => {
    if (model !== undefined) {
      settings.push({ file, path, owner, role, model, startsAProgram });
    }
  };
  for (const workspace of context.filesOf("workspace")) {
    const defaults = { owner: "The default model", role: "the workspace's default" };
    add(workspace.path, ["defaults", "model"], defaults, workspace.value.defaults.model);
    const assistant = { owner: "The session AI", role: "used by the session AI" };
    add(workspace.path, ["assistant", "model"], assistant, workspace.value.assistant?.model);
  }
  for (const hub of context.filesOf("hub")) {
    const defaults = { owner: "The hub's default model", role: "the hub's default" };
    add(hub.path, ["defaults", "model"], defaults, hub.value.defaults.model);
  }
  for (const agent of context.filesOf("agent")) {
    const name = agent.value.id;
    const harness = agent.value.harness;
    const program = harness !== undefined && harness !== "halonic";
    const agentOwner = { owner: `Agent "${name}"`, role: `used by the agent ${name}` };
    add(agent.path, ["model"], agentOwner, agent.value.model, program);
    for (const [methodId, method] of Object.entries(agent.value.methods)) {
      const path = ["methods", methodId, "model"];
      const methodName = `${name}.${methodId}`;
      const methodOwner = {
        owner: `Method "${methodName}"`,
        role: `used by the method ${methodName}`,
      };
      add(agent.path, path, methodOwner, method.model, program);
    }
  }
  return settings;
}
