import {
  type AgentModelParams,
  type AgentModelParamsChange,
  agentReasoningEfforts,
} from "@halonicjs/studio-feature-agents/api";
import type { YamlEdit } from "@halonicjs/yaml";

const inRange = (value: number, min: number, max: number) =>
  Number.isFinite(value) && value >= min && value <= max;

/**
 * Why a change to the model settings can't be written, as the agent file's schema would refuse
 * it; `undefined` when it can. `null` takes a setting out, so it is always fine.
 */
export function paramsProblem(change: AgentModelParamsChange): string | undefined {
  const { temperature, topP, maxTokens, stop, reasoningEffort } = change;
  if (temperature != null && !inRange(temperature, 0, 2)) {
    return "The temperature is a number from 0 to 2.";
  }
  if (topP != null && !inRange(topP, 0, 1)) return "Top-p is a number from 0 to 1.";
  if (maxTokens != null && !(Number.isInteger(maxTokens) && maxTokens > 0)) {
    return "Max tokens is a whole number above 0.";
  }
  if (stop?.some((sequence) => sequence === "")) {
    return "A stop sequence can't be empty.";
  }
  if (reasoningEffort != null && !agentReasoningEfforts.includes(reasoningEffort)) {
    return "The reasoning effort is low, medium or high.";
  }
  return undefined;
}

/**
 * The edits for a change to the model settings, each in place under `params`, so the settings it
 * doesn't name and the provider extras stay. A setting the file doesn't have isn't deleted again.
 */
export function paramsEdits(current: AgentModelParams, change: AgentModelParamsChange): YamlEdit[] {
  const edits: YamlEdit[] = [];
  for (const [key, value] of Object.entries(change)) {
    if (value === undefined) continue;
    const path = ["params", key];
    if (value !== null) edits.push({ kind: "set", path, value });
    else if (current[key as keyof AgentModelParams] !== undefined) {
      edits.push({ kind: "delete", path });
    }
  }
  return edits;
}

/** The model settings an agent's file sets, without the provider extras, which Studio doesn't show. */
export function paramsOf(
  params: AgentModelParams & { readonly extra?: unknown },
): AgentModelParams {
  const { extra: _extra, ...shown } = params;
  return shown;
}
