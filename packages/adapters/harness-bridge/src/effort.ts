import type { BridgeEffort, BridgeProviderAccess } from "@halonicjs/ports";
import { isPlainObject } from "@halonicjs/std";

/** Where one API takes a call's effort: a key in one of the request's top-level objects. */
export interface EffortField {
  /** The top-level field whose object holds the effort, such as Anthropic's `output_config`. */
  object: string;
  /** The effort's key in that object. */
  key: string;
}

/** Anthropic's Messages API: `output_config.effort`, which needs no beta header. */
export const anthropicEffort: EffortField = { object: "output_config", key: "effort" };

/** OpenAI's Responses API: `reasoning.effort`. */
export const openAiEffort: EffortField = { object: "reasoning", key: "effort" };

/**
 * The effort the host set for `model` in the agent's access, or `undefined`
 * when it set none. Only the table's own entries count, so a model the
 * program names `toString` gets no effort from `Object.prototype`.
 */
export function effortFor(access: BridgeProviderAccess, model: string): BridgeEffort | undefined {
  const efforts = access.efforts;
  if (efforts === undefined || !Object.hasOwn(efforts, model)) return undefined;
  return efforts[model];
}

/**
 * The request with `effort` in place of the program's own (requirement
 * `harness-bridge.effort`), keeping the other keys of the object that holds
 * it, such as Anthropic's `output_config.format` or OpenAI's
 * `reasoning.summary`. Without an effort, the request comes back as it was.
 *
 * The bridge sets only the effort and never `thinking`: Claude Opus 5.5 and
 * Sonnet 5.5 refuse `thinking: disabled`, and the 5.x models refuse a
 * thinking budget, while every model that thinks adaptively takes an effort.
 */
export function withEffort(
  request: unknown,
  effort: BridgeEffort | undefined,
  field: EffortField,
): unknown {
  if (effort === undefined || !isPlainObject(request)) return request;
  const current = request[field.object];
  const kept = isPlainObject(current) ? current : {};
  return { ...request, [field.object]: { ...kept, [field.key]: effort } };
}
