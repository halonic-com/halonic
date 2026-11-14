import type { SettingsPlace } from "@halonicjs/studio-shell";

/**
 * The words of Settings → Assistant: flow-settings 7 for the controls, the microcopy (14 and 13)
 * for the errors. A failed save follows the Appearance pattern with its own name (team decision,
 * HAL-1294).
 */

/** The first line under the section's name (`settings.ai-agent-section`). */
export const FIRST_LINE: Readonly<Record<SettingsPlace, string>> = {
  app: "Used for new assistant chats in every workspace on this computer. Never saved in a workspace.",
  served:
    "Used for new assistant chats in every workspace on the computer running Halonic. Never saved in a workspace.",
};

export const MODEL_GROUP = "Assistant model";
export const ANSWERS_GROUP = "Answers";
export const PROVIDER = "Provider";
export const MODEL = "Model";
export const TURN_LIMIT = "Turn limit";
export const TURN_LIMIT_HINT =
  "Model turns, tool calls included, before it stops and asks to continue.";
export const CONNECTOR_TOOLS = "Connector tools";
export const CONNECTOR_TOOLS_SENTENCE = "Let the assistant use the open workspace's connectors.";
export const INSTRUCTIONS = "Instructions";
export const INSTRUCTIONS_PLACEHOLDER = "Add instructions";
export const NOT_SET_UP_LINE = "Not set up. Assistant chats use each workspace's model aliases.";

/** The Callout when the computer's host settings can't be read, with its button. */
export const NOT_LOADED = "Couldn't load the Assistant settings from this computer.";
export const TRY_AGAIN = "Try again";

/** The line under a control whose save failed. */
export function notSaved(what: string): string {
  return `Couldn't save ${what} on this computer.`;
}

export const HOW_IT_CONNECTS = "How it connects";
export const BASE_URL = "Base URL";
export const SECRET_NAME = "Secret name";
export const LOCAL = "Local";
export const LOCAL_SENTENCE =
  "On for a model that runs on this computer or your own network. A local-only workspace can only use local models.";

/** The line of Settings → Assistant when it is served to another device (`settings.ai-agent-view-only`). */
export const VIEW_ONLY_LINE =
  "View only here. Change the assistant on the computer running Halonic.";
export const NOTHING = "Not set";
export const ON = "On";
export const OFF = "Off";

export const TUNING = "Tuning";
export const TEMPERATURE = "Temperature";
export const TOP_P = "Top-p";
export const MAX_TOKENS = "Max tokens";
export const STOP = "Stop";
export const REASONING_EFFORT = "Reasoning effort";
export const TUNING_HINT = "Empty means the provider's default.";
export const STOP_HINT = "One stop sequence per line. Empty means the provider's default.";
export const PROVIDER_DEFAULT = "Provider default";

export const KEY = "Key";
export const KEY_NOT_NEEDED = "No key needed.";
export const KEY_SET = "● Key set";
export const KEY_MISSING = "○ No key";
export const KEY_REPLACE = "Replace it on the provider page ›";
export const KEY_ADD = "Add it on the provider page ›";
export const KEY_NO_WORKSPACE = "○ No key. Open a workspace to add it.";
export const KEY_UNKNOWN = "Couldn't check for a key.";
export const KEY_SERVED_SET = "Set on the computer running Halonic";
export const KEY_SERVED_MISSING = "No key on the computer running Halonic";

/** The tail of the key line when no provider of the open workspace uses the secret name. */
export function keyAddProvider(workspace: string): string {
  return `Add a provider that uses the secret name to ${workspace} ›`;
}

/** The warning above the fields (`settings.ai-agent.local-only-warning`). */
export function localOnlyWarning(workspace: string): string {
  return `${workspace} is local only, so it can't use this cloud model.`;
}

/** The line when the open workspace sets its own assistant model. */
export function setsItsOwn(workspace: string, model: string): string {
  return `${workspace} sets its own assistant model (${model}).`;
}
export const WORKSPACE_SETTINGS = "Workspace settings ›";
