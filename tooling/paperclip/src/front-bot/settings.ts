import { readTaskEffortSettings, type SecretRef, secretRef } from "../task-effort/settings.ts";
import { type QuickEffort, type QuickRunSettings, quickEfforts } from "./run-choice.ts";

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
  /** Progress notes' own switch (HAL-19218): notes run only when this and `enabled` are exactly `true`. */
  readonly notesEnabled: boolean;
  /** Paperclip's API and the key the notes read a run's status and log with, shared with the other handlers. */
  readonly apiUrl: string | undefined;
  readonly apiKey: SecretRef | undefined;
  /** Front bot v2 (HAL-19219): store a quick message's run choice for the server's hook. Off unless exactly `true`. */
  readonly runChoice: boolean;
  /** What a quick run gets. */
  readonly quickRun: QuickRunSettings;
  /**
   * The Studio lookups (HAL-19222): only when this is exactly `true` and the
   * kill switch is on too, so turning the bot off stops them as well.
   */
  readonly lookups: boolean;
}

function quickEffort(value: unknown): QuickEffort {
  return quickEfforts.find((effort) => effort === value) ?? "low";
}

function quickModel(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

/** Reads the front bot's settings; anything odd counts as off or unset. */
export function readFrontBotSettings(config: Readonly<Record<string, unknown>>): FrontBotSettings {
  const paperclip = readTaskEffortSettings(config);
  return {
    enabled: config["frontBotEnabled"] === true,
    anthropicKey: secretRef(config["frontBotAnthropicKey"]),
    notesEnabled: config["frontBotNotesEnabled"] === true,
    apiUrl: paperclip.apiUrl,
    apiKey: paperclip.apiKey,
    runChoice: config["frontBotRunChoice"] === true,
    quickRun: {
      effort: quickEffort(config["frontBotQuickEffort"]),
      model: quickModel(config["frontBotQuickModel"]),
    },
    lookups: config["frontBotEnabled"] === true && config["frontBotLookups"] === true,
  };
}

/** The key to call with when the board turned the bot on and stored its key; otherwise undefined. */
export function frontBotKey(settings: FrontBotSettings): SecretRef | undefined {
  return settings.enabled ? settings.anthropicKey : undefined;
}

/** What progress notes need once the board turned them on. */
export interface ActiveNotesSettings {
  readonly anthropicKey: SecretRef;
  readonly apiUrl: string;
  readonly apiKey: SecretRef;
}

/** The settings to write notes with when both switches are on and every key is set; otherwise undefined. */
export function progressNotesOn(settings: FrontBotSettings): ActiveNotesSettings | undefined {
  const { enabled, notesEnabled, anthropicKey, apiUrl, apiKey } = settings;
  if (!enabled || !notesEnabled) {
    return undefined;
  }
  if (anthropicKey === undefined || apiUrl === undefined || apiKey === undefined) {
    return undefined;
  }
  return { anthropicKey, apiUrl, apiKey };
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
  frontBotLookups: {
    type: "boolean",
    title: "Front bot lookups (Automatic answer)",
    description:
      'Off: the front bot never answers by itself. On, with the front bot on: a board user\'s plain question about a PR\'s status ("Is #6129 merged?") or a task\'s run ("Is HAL-123 running?") gets an answer read from GitHub or Paperclip, labelled "Automatic answer · from PR status" or "· from run status". It reads only, never acts, needs no Anthropic key, and leaves everything else to the agent.',
    default: false,
  },
  frontBotNotesEnabled: {
    type: "boolean",
    title: "Front bot progress notes",
    description:
      "Off: no progress notes. On (with the front bot on): while an agent works on a board user's chat message, up to 5 short notes from Haiku 4.5 about what its run shows, read from the run's tool steps only (never their output or the agent's thinking). Notes are never comments; Messenger reads them from the chat-notes route. They share the front bot's $3 daily cap and need Paperclip's API url and key.",
    default: false,
  },
  frontBotRunChoice: {
    type: "boolean",
    title: "Front bot: lower effort for quick questions",
    description:
      "Off: chat runs start with the agent's normal settings. On: when the front bot's first-reply call finds a message is only a quick question, the run it wakes gets the quick-run effort (and model) below, for that run only. Needs the front bot on and the server patch from HAL-19219, which only ever lowers effort and only allows models on HALONIC_TASK_MODELS.",
    default: false,
  },
  frontBotQuickEffort: {
    type: "string",
    enum: [...quickEfforts],
    title: "Front bot: quick-run effort",
    description:
      "The effort a quick question's run gets. The server ignores it when it isn't lower than the run's own effort.",
    default: "low",
  },
  frontBotQuickModel: {
    type: "string",
    title: "Front bot: quick-run model",
    description:
      "Optional model for a quick question's run. Empty: the agent's own model. The server uses it only when it is on HALONIC_TASK_MODELS.",
  },
} as const;
