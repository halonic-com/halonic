// A Build chat's failed model call as a failed run's facts (`chatFailureOf`), so the chat says the
// provider's own sentence the run page says (states H22, microcopy 22 F7, F8). The chat knows the
// model it called: the alias its turn named, or the person's own Settings › Assistant model.

import type { ChatAnswer, ChatSettings } from "@halonicjs/app";
import {
  chatFailureOf,
  type FailedModel,
  type RunFailure,
  workspaceModelsOf,
} from "@halonicjs/app/run-failure";
import type { Provider } from "@halonicjs/format";
import type { ChatAgentSettings } from "@halonicjs/ports";
import type { AssistantAnswer } from "@halonicjs/studio-feature-assistant/api";
import type { LoadedWorkspace } from "@halonicjs/workspace";
import { providerHost } from "../runs/provider-host.ts";

/** A Build chat calls its model for no agent of the workspace. */
const buildChatAgent = "assistant";

/** The answer with its model call's facts when it failed at the model, as it is otherwise. */
export function answerWithFailure(
  answer: ChatAnswer,
  settings: ChatSettings,
  workspace: LoadedWorkspace,
): AssistantAnswer {
  const failure = chatFailureOfAnswer(answer, settings, workspace);
  return failure === undefined ? answer : { ...answer, failure };
}

/**
 * The facts of a failed answer's model call; `undefined` when it didn't fail at the model, or
 * failed for no reason a run names, so the chat says "Couldn't reach the model: *reason*.".
 *
 * @example
 * chatFailureOfAnswer(answer, { hubId: "support", alias: "fast" }, loaded);
 * // { reason: "model-unreachable", provider: "Ollama", address: "localhost:11434", alias: "fast", local: true }
 */
export function chatFailureOfAnswer(
  answer: ChatAnswer,
  settings: ChatSettings,
  workspace: LoadedWorkspace,
): RunFailure | undefined {
  const { end } = answer;
  if (end.reason !== "failed" || end.cause === undefined) return undefined;
  return chatFailureOf(end.cause, end.error.message, calledModelOf(settings, workspace));
}

/** The model the chat's turn called: its alias in the workspace, or the device model. */
function calledModelOf(
  settings: ChatSettings,
  workspace: LoadedWorkspace,
): FailedModel | undefined {
  if (settings.agent !== undefined) return deviceModelOf(settings.agent);
  if (settings.alias === undefined) return undefined;
  const models = workspaceModelsOf(workspace, settings.hubId, providerHost);
  const target = models.aliases.get(settings.alias);
  if (target === undefined) return undefined;
  return {
    alias: settings.alias,
    model: target.model,
    agent: buildChatAgent,
    workspace: models.name,
    providerId: target.provider,
    provider: models.providers.get(target.provider),
    address: models.addresses.get(target.provider),
    keyMissing: false,
  };
}

/**
 * The Settings › Assistant model, which no provider file names: its type stands in for the
 * provider's id, so the sentence names a known provider, such as Ollama, by its name.
 */
function deviceModelOf(agent: ChatAgentSettings): FailedModel {
  const provider: Provider = {
    version: 1,
    id: agent.type,
    type: agent.type,
    local: agent.local,
    options: {},
    ...(agent.baseUrl === undefined ? {} : { baseUrl: agent.baseUrl }),
  };
  return {
    alias: `${agent.type}/${agent.model}`,
    model: agent.model,
    agent: buildChatAgent,
    workspace: "",
    providerId: agent.type,
    provider,
    address: providerHost(provider),
    keyMissing: false,
  };
}
