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

/** The line under a control whose save failed. */
export function notSaved(what: string): string {
  return `Couldn't save ${what} on this computer.`;
}
