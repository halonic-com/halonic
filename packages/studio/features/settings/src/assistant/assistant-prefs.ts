import { hostSetting } from "@halonicjs/app";
import { type AssistantProvider, assistantProviders } from "./assistant-providers.ts";

/** Fewest and most model turns before the Assistant stops and asks to continue. */
export const turnLimitRange = { min: 1, max: 64, fallback: 16 } as const;

/** Whether `value` is a turn limit: a whole number from 1 to 64. */
export function isTurnLimit(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= turnLimitRange.min &&
    value <= turnLimitRange.max
  );
}

const isText = (value: unknown): value is string => typeof value === "string";
const isFlag = (value: unknown): value is boolean => typeof value === "boolean";

/**
 * The Assistant's settings (`settings.ai-agent-prefs`): kept where Halonic runs and used for new
 * assistant chats in every workspace on the computer, never saved in a workspace. A value that
 * can't be read reads as its fallback, so a damaged file leaves the Assistant Not set up, with
 * turn limit 16 and connector tools on.
 */
export const assistantPrefs = {
  provider: hostSetting<AssistantProvider>(
    "assistant.provider",
    "not-set-up",
    (value): value is AssistantProvider =>
      assistantProviders.some((provider) => provider === value),
  ),
  model: hostSetting("assistant.model", "", isText),
  baseUrl: hostSetting("assistant.base-url", "", isText),
  /** The name of the key, never the key. */
  secretName: hostSetting("assistant.secret-name", "", isText),
  local: hostSetting("assistant.local", false, isFlag),
  turnLimit: hostSetting("assistant.turn-limit", turnLimitRange.fallback, isTurnLimit),
  connectorTools: hostSetting("assistant.connector-tools", true, isFlag),
  instructions: hostSetting("assistant.instructions", "", isText),
};
