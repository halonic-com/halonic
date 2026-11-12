// The model of a test case's model call: the agent's model from the
// workspace, as a real run picks it, but answered by the case's script.

import { layeredParams, type ResolvedModel } from "@halonicjs/engine";
import type { ChatTurnRequest, LlmProvider } from "@halonicjs/ports";
import {
  callModelName,
  definitionsOf,
  type LoadedWorkspace,
  type ModelTarget,
  modelPrice,
  resolveModel,
} from "@halonicjs/workspace";

/**
 * The engine's `resolveModel` for a test case. It names the model with
 * `callModelName`, as the CLI's `workspaceModelResolver` does: the request's
 * `alias`, else the agent's `model`, else the hub's default, else the
 * workspace's; so the run logs that model, and prices the call from the
 * alias's `price`.
 * Every call goes to `provider`, the case's scripted model, and runs on this
 * computer. The alias's fallbacks are left out: the script answers each call.
 * A name the hub has no alias for gives the model `test`, unpriced.
 *
 * @example
 * resolveModel: testModelResolver(workspace, model.provider),
 * // checker's model "fast" in models.yaml:
 * // { provider, model: "echo-fast", alias: "fast", local: true, price: { input: 0.05, output: 0.2 }, params }
 */
export function testModelResolver(
  workspace: LoadedWorkspace,
  provider: LlmProvider,
): (request: ChatTurnRequest) => Promise<ResolvedModel> {
  return async (request) => {
    const name = callModelName(definitionsOf(workspace, request.hubId), request);
    const target = resolveModel(workspace, request.hubId, name);
    return target === undefined
      ? { provider, model: "test", local: true }
      : scriptedModel(provider, target);
  };
}

/** The target's model, alias, price and params, on the scripted provider. */
function scriptedModel(provider: LlmProvider, target: ModelTarget): ResolvedModel {
  const params = layeredParams(target.params);
  return {
    provider,
    model: target.model,
    local: true,
    ...(target.alias === undefined ? {} : { alias: target.alias }),
    ...(target.price === undefined ? {} : { price: modelPrice(target.price) }),
    ...(params === undefined ? {} : { params }),
  };
}
