// A model without a price counts 0 cost, so a `cost` limit never stops its
// calls. In a deployment with `users.mode: many` and `meter: config`, a
// `cost` limit is what holds other people to what the owner pays for, so
// every agent there must call only priced models: the workspace check
// refuses the others with the one code here, and its error stops every run
// that uses the agent (requirement `workspace.many-users-unpriced-model`,
// HAL-16880).

import type { Deployment, UsageLimit } from "@halonicjs/format";
import { filesOf, type LoadedFile, type LoadedFileOf } from "./load-workspace.ts";
import { type ModelTarget, resolveModel } from "./resolve-model.ts";
import { startsAProgram } from "./run-problems.ts";

/** The code the check gives for an agent that could call a model without a price under a `cost` limit. */
export const manyUsersUnpricedModelCode = "users-many-unpriced-model";

/** An agent that could call a model whose cost isn't known. */
export interface UnpricedAgent {
  /** The agent file's path. */
  readonly file: string;
  readonly id: string;
  /** The model name it calls, its own or the hub's default; absent for a program that picks its own. */
  readonly model?: string;
  /** The harness program, when it starts one. */
  readonly harness?: string;
  /** The key of the agent file that chose the model; `[]` when it uses the hub's default. */
  readonly at: readonly ("model" | "harness")[];
}

/**
 * Whether a deployment lets many people sign in and stops them at a `cost`
 * limit of `meter: config`: their own, their organisation's or their share
 * of it. A `notify` limit stops nobody, so it doesn't count.
 */
export function stopsAtCostWithManyUsers(deployment: Deployment): boolean {
  const users = deployment.users;
  if (users?.mode !== "many" || users.meter !== "config") return false;
  const organisations = users.config?.organisations ?? [];
  const limits: readonly UsageLimit[] = [
    ...(users.config?.limits ?? []),
    ...organisations.flatMap((organisation) => [
      ...organisation.limits,
      ...organisation.members.flatMap((member) => member.limits ?? []),
    ]),
  ];
  return limits.some((limit) => limit.unit === "cost" && limit.action === "stop");
}

/**
 * The agents that could call a model without a price: one whose model, or a
 * model its alias falls back to, has no `price` in `models.yaml` or the hub,
 * one that names a model as `provider/model`, which carries no price, and a
 * harness agent that names no model, whose program picks one Halonic has no
 * price for. An agent of Halonic's own loop without a model calls the hub's
 * default. An alias no file has is the loader's to report, so it is left out.
 *
 * @example
 * unpricedAgents(workspace.files);
 * // [{ file: "hubs/support/agents/writer.agent.yaml", id: "writer", model: "cheap" }]
 */
export function unpricedAgents(files: readonly LoadedFile[]): UnpricedAgent[] {
  const workspace = { files };
  return filesOf(workspace, "agent").flatMap((agent): UnpricedAgent[] => {
    const { id, harness } = agent.value;
    const file = agent.path;
    const model = modelNameOf(workspace, agent);
    if (model === undefined) {
      return [{ file, id, ...(harness === undefined ? {} : { harness }), at: ["harness"] }];
    }
    const target = resolveModel(workspace, agent.hub, model);
    if (target === undefined) return [];
    const targets: readonly ModelTarget[] = [target, ...target.fallback];
    if (targets.every((each) => each.price !== undefined)) return [];
    return [{ file, id, model, at: agent.value.model === undefined ? [] : ["model"] }];
  });
}

/**
 * Why a deployment refuses an agent: many people sign in and a `cost` limit
 * stops them, and the agent's calls would count no cost.
 */
export function manyUsersUnpricedMessage(deployment: string, agent: UnpricedAgent): string {
  const intro = `Deployment "${deployment}" lets many people sign in and stops them at a cost limit`;
  if (agent.model === undefined) {
    return `${intro}, and agent "${agent.id}" names no model, so ${agent.harness} picks one without a price and its calls would count no cost. Set model to an alias with a price.`;
  }
  return `${intro}, and agent "${agent.id}" calls model "${agent.model}", which has no price or falls back to one without, so its calls would count no cost. Use an alias with a price, and give each of its fallbacks one too.`;
}

/**
 * The model name an agent calls: its own `model`, else, in Halonic's own
 * loop, the hub's default, then the workspace's, then `default`. `undefined`
 * for a harness agent without a model, whose program picks its own.
 */
function modelNameOf(
  workspace: { readonly files: readonly LoadedFile[] },
  agent: LoadedFileOf<"agent">,
): string | undefined {
  if (agent.value.model !== undefined) return agent.value.model;
  if (startsAProgram(agent.value.harness)) return undefined;
  const settings = filesOf(workspace, "workspace")[0]?.value;
  const hub = filesOf(workspace, "hub").find((file) => file.hub === agent.hub)?.value;
  // `default` is the format's own default, as `callModelName` gives it.
  return hub?.defaults.model ?? settings?.defaults.model ?? "default";
}
