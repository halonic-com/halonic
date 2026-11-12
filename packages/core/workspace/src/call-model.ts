// The model a run's model call uses, named and priced from the workspace's
// files. The CLI's resolver and the test runner both pick it here, so a test
// case's call logs the model and the cost a real run's does.

import type { ChatTurnRequest, ModelPrice } from "@halonicjs/ports";
import type { HubDefinitions } from "./definitions.ts";
import type { ModelTarget } from "./resolve-model.ts";

/**
 * The model name a call uses, in order: the call's `alias`, the `model` of
 * its agent, the hub's default model, else the workspace's, else `default`.
 * Resolve it with `resolveModel`.
 *
 * @param definitions - the definitions of the call's hub, from `definitionsOf`
 * @param call - the call's alias and agent; an agent the hub doesn't have has no model
 *
 * @example
 * callModelName(definitionsOf(workspace, "support"), { agentId: "writer" });
 * // "smart", the writer agent's `model`
 */
export function callModelName(
  definitions: HubDefinitions,
  call: Pick<ChatTurnRequest, "alias" | "agentId">,
): string {
  const agentModel =
    call.agentId === undefined ? undefined : definitions.agents[call.agentId]?.model;
  // `default` is the format's own default, for a workspace.yaml that didn't parse.
  return call.alias ?? agentModel ?? definitions.defaultModel ?? "default";
}

/**
 * An alias's price as the engine takes it: the file format reads a cache
 * price it doesn't have as `undefined`, the engine wants it left out.
 *
 * @example
 * modelPrice({ input: 5, output: 25, cacheRead: undefined });
 * // { input: 5, output: 25 }
 */
export function modelPrice(price: NonNullable<ModelTarget["price"]>): ModelPrice {
  const { input, output, cacheRead, cacheWrite, cacheWrite1h } = price;
  return {
    input,
    output,
    ...(cacheRead === undefined ? {} : { cacheRead }),
    ...(cacheWrite === undefined ? {} : { cacheWrite }),
    ...(cacheWrite1h === undefined ? {} : { cacheWrite1h }),
  };
}
