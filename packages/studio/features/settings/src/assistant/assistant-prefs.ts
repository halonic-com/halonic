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

/** The tuning ranges the agent file allows (`ModelParams`): temperature 0 to 2, top-p 0 to 1. */
export const tuningRanges = { temperature: { min: 0, max: 2 }, topP: { min: 0, max: 1 } } as const;

/** What a model may be asked to reason about before it answers; "" leaves it to the provider. */
export const reasoningEfforts = ["", "low", "medium", "high"] as const;
/** One of {@link reasoningEfforts}. */
export type ReasoningEffort = (typeof reasoningEfforts)[number];

const isNumberIn =
  (range: { min: number; max: number }) =>
  (value: unknown): value is number =>
    typeof value === "number" && value >= range.min && value <= range.max;
const orNull =
  (accepts: (value: unknown) => value is number) =>
  (value: unknown): value is number | null =>
    value === null || accepts(value);

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
  /** Tuning (`settings.ai-agent-tuning`): `null`, empty or "" means the provider's own default. */
  temperature: hostSetting<number | null>(
    "assistant.temperature",
    null,
    orNull(isNumberIn(tuningRanges.temperature)),
  ),
  topP: hostSetting<number | null>("assistant.top-p", null, orNull(isNumberIn(tuningRanges.topP))),
  maxTokens: hostSetting<number | null>(
    "assistant.max-tokens",
    null,
    orNull((value): value is number => Number.isInteger(value) && (value as number) > 0),
  ),
  stop: hostSetting<readonly string[]>(
    "assistant.stop",
    [],
    (value): value is readonly string[] =>
      Array.isArray(value) && value.every((item) => typeof item === "string" && item !== ""),
  ),
  reasoningEffort: hostSetting<ReasoningEffort>(
    "assistant.reasoning-effort",
    "",
    (value): value is ReasoningEffort => reasoningEfforts.some((effort) => effort === value),
  ),
};
