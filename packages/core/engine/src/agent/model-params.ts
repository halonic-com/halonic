// The params of one model call come in layers: the alias's from
// `models.yaml`, then the agent's own, then a chat turn's request. Each layer
// sets keys over the ones below it, key by key; a later layer never removes
// a key, and `extra` is one key like any other (Liam, HAL-6450).

import type { Agent } from "@halonicjs/format";
import type { ChatParams } from "@halonicjs/ports";

/** One layer of params, as a file gives them: a key it leaves out may read as `undefined`. */
export type ParamsLayer = { readonly [Key in keyof ChatParams]?: ChatParams[Key] | undefined };

/**
 * The params of the layers, later layers winning key by key. A key a layer
 * leaves out, or sets to `undefined`, keeps the value below it.
 *
 * @returns the merged params, or `undefined` when no layer sets any key
 *
 * @example
 * layeredParams({ temperature: 0.2, maxTokens: 800 }, { temperature: 0.7 });
 * // { temperature: 0.7, maxTokens: 800 }
 */
export function layeredParams(
  ...layers: readonly (ParamsLayer | undefined)[]
): ChatParams | undefined {
  const merged: Record<string, unknown> = {};
  for (const layer of layers) {
    for (const [key, value] of Object.entries(layer ?? {})) {
      if (value !== undefined) {
        merged[key] = value;
      }
    }
  }
  return Object.keys(merged).length === 0 ? undefined : (merged as ChatParams);
}

/**
 * The `params` of a turn for an agent, to spread into its input: the agent's
 * own, then a chat turn's request's on top. The chain lays them over each
 * model's alias params (see `ModelChain`). Empty when neither sets a key.
 *
 * @param agent - the agent's file; `undefined` for a turn without one
 */
export function agentParamsOf(
  agent: Agent | undefined,
  request?: ChatParams,
): { readonly params?: ChatParams } {
  const params = layeredParams(agent?.params, request);
  return params === undefined ? {} : { params };
}
