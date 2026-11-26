import { type SecretRef, secretRef } from "../task-effort/settings.ts";

/**
 * The front bot's settings, as the board saves them in the plugin's settings
 * (HAL-19136, design on HAL-18847 section 4.3). Only the board can change
 * those, so the kill switch is board-only, and it is off by default.
 */

/** The front bot's part of a company's settings. */
export interface FrontBotSettings {
  /** The kill switch: the bot calls nothing and posts nothing unless this is exactly `true`. */
  readonly enabled: boolean;
  /** The secret with the bot's own Anthropic API key (FRONT_BOT_ANTHROPIC_API_KEY). */
  readonly anthropicKey: SecretRef | undefined;
}

/** Reads the front bot's settings; anything odd counts as off or unset. */
export function readFrontBotSettings(config: Readonly<Record<string, unknown>>): FrontBotSettings {
  return {
    enabled: config["frontBotEnabled"] === true,
    anthropicKey: secretRef(config["frontBotAnthropicKey"]),
  };
}

/** The key to call with when the board turned the bot on and stored its key; otherwise undefined. */
export function frontBotKey(settings: FrontBotSettings): SecretRef | undefined {
  return settings.enabled ? settings.anthropicKey : undefined;
}

/** The plugin settings the board sees for the front bot, spread into the manifest's schema. */
export const frontBotConfigProperties = {
  frontBotEnabled: {
    type: "boolean",
    title: "Front bot (Automatic note)",
    description:
      "Off: the front bot calls nothing and posts nothing. On: a board user's message on a chat task gets a first reply of one or two sentences from Haiku 4.5, posted as an Automatic note, or nothing when it has nothing useful to say. It also needs the Front bot Anthropic key. It stops by itself for the day at $3, and for 15 minutes when more than 1 in 5 calls fail.",
    default: false,
  },
  frontBotAnthropicKey: {
    type: "string",
    title: "Front bot Anthropic key",
    description:
      "The secret with the front bot's own Anthropic API key (FRONT_BOT_ANTHROPIC_API_KEY), from its own Anthropic workspace with a spend limit. Sent only to api.anthropic.com; never logged.",
    format: "secret-ref",
  },
} as const;
