import {
  type ChatAnswerRequest,
  type ChatSettings,
  type ChatTool,
  type HostSettings,
  maxTurnLimit,
} from "@halonicjs/app";
import type { ChatAgentSettings, ChatMessage } from "@halonicjs/ports";
import type { ChatModel, ShownItem } from "@halonicjs/studio-feature-assistant/api";
import { assistantPrefs } from "@halonicjs/studio-feature-settings/api";
import { filesOf, type LoadedWorkspace } from "@halonicjs/workspace";

/** One answer's model and tools; an agent chat also brings its own model call limit. */
export interface ChatModelParts {
  readonly settings: ChatSettings;
  readonly tools: readonly ChatTool[];
  /**
   * Narrows a Build chat's tools once a docs page is loaded, before each model turn
   * (`assistant.build.loaded-page`).
   */
  readonly offerTools?: NonNullable<ChatAnswerRequest["offerTools"]>;
  readonly turnLimit?: number | undefined;
}

/** The alias `workspace.yaml` sets for the workspace's own assistant chats, or `null`. */
export function assistantModelOf(workspace: LoadedWorkspace): string | null {
  return filesOf(workspace, "workspace")[0]?.value.assistant?.model ?? null;
}

/**
 * The person's own model from Settings › Assistant, as a chat turn takes a model no workspace
 * file names, or `undefined` while it isn't set up. Only the key's name goes, never the key.
 */
export function deviceModelOf(settings: Pick<HostSettings, "get">): ChatAgentSettings | undefined {
  const provider = settings.get(assistantPrefs.provider);
  const model = settings.get(assistantPrefs.model).trim();
  if (provider === "not-set-up" || model === "") return undefined;
  const baseUrl = settings.get(assistantPrefs.baseUrl).trim();
  const secret = settings.get(assistantPrefs.secretName).trim();
  return {
    type: provider,
    model,
    local: settings.get(assistantPrefs.local),
    ...(baseUrl === "" ? {} : { baseUrl }),
    ...(secret === "" ? {} : { secret }),
  };
}

/**
 * A chat turn's model settings for the chat's model (flow-assistant 5.2). The Assistant model is
 * the workspace's own alias when it sets one, else the Settings › Assistant model, else the alias
 * `default`, the last of a new chat's order, so a model is never swapped without a name.
 */
export function chatSettingsOf(
  model: ChatModel,
  workspace: LoadedWorkspace,
  settings: Pick<HostSettings, "get">,
): ChatSettings {
  const hubId = hubOf(workspace);
  if (model.kind === "alias") return { hubId, alias: model.name };
  const own = assistantModelOf(workspace);
  if (own !== null) return { hubId, alias: own };
  const device = deviceModelOf(settings);
  return device === undefined ? { hubId, alias: "default" } : { hubId, agent: device };
}

/**
 * The most model turns of one answer (flow-assistant 3.6): `assistant.maxSteps` in
 * `workspace.yaml` when set, else the Settings › Assistant model call limit, 16 unless changed.
 */
export function turnLimitOf(
  workspace: LoadedWorkspace,
  settings: Pick<HostSettings, "get">,
): number {
  const own = filesOf(workspace, "workspace")[0]?.value.assistant?.maxSteps;
  return own ?? settings.get(assistantPrefs.turnLimit);
}

/**
 * The most model turns of one answer before trust (HAL-720 condition 7): the Settings › Assistant
 * limit, which an untrusted `workspace.yaml` may lower and never raise. A `maxSteps` that isn't a
 * whole number above 0 counts as not set.
 */
export function authoringTurnLimitOf(
  workspace: LoadedWorkspace,
  settings: Pick<HostSettings, "get">,
): number {
  const own: unknown = filesOf(workspace, "workspace")[0]?.value.assistant?.maxSteps;
  const limit = Math.min(settings.get(assistantPrefs.turnLimit), maxTurnLimit);
  const valid = typeof own === "number" && Number.isSafeInteger(own) && own > 0;
  return valid ? Math.min(own, limit) : limit;
}

/** Whether the workspace sets `privacy.localOnly`, which can only narrow the models called. */
export function localOnlyOf(workspace: LoadedWorkspace): boolean {
  return filesOf(workspace, "workspace")[0]?.value.privacy.localOnly === true;
}

/**
 * The hub a Build chat's turns name. A chat turn resolves aliases in a hub, and a Build chat
 * belongs to the whole workspace, so it names the first hub by id: its aliases are `models.yaml`'s
 * and that hub's own. A workspace without hubs gives "", which the engine refuses with its reason.
 */
function hubOf(workspace: LoadedWorkspace): string {
  const hubs = workspace.files.flatMap((file) => (file.hub === null ? [] : [file.hub]));
  return hubs.sort()[0] ?? "";
}

/**
 * What Show in chat put in the chat, told to the model with this answer only (flow-assistant 5.7):
 * a note before the person's message, never kept, so a removed chip is gone from the next one.
 */
export function shownNote(shown: readonly ShownItem[] | undefined): ChatMessage[] {
  if (shown === undefined || shown.length === 0) return [];
  const items = shown.map(({ item, name }) => `${item.kind} "${name}" (${item.hub}/${item.id})`);
  return [{ role: "system", content: `The person showed you these items: ${items.join(", ")}.` }];
}
