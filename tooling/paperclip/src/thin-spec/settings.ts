import { readTaggerSettings } from "../difficulty-tagger/settings.ts";
import type { SecretRef } from "../task-effort/settings.ts";
import { type ThinSpecModel, usableModel } from "./score.ts";

/**
 * The thin-spec check's settings, as the board saves them in the plugin's
 * settings. It shares the difficulty tagger's Anthropic key and Paperclip's
 * API with the tagger and the task effort handler; its own switch is board-only.
 */

/** The check's part of a company's settings. */
export interface ThinSpecSettings {
  /** The plugin version the board turned the check on for; off after every install and upgrade. */
  readonly forVersion: string | undefined;
  /**
   * The url key of the agent that clarifies a flagged task a person created
   * (a PM agent). A task an agent created goes back to that agent.
   */
  readonly clarifier: string | undefined;
  readonly anthropicKey: SecretRef | undefined;
  readonly apiUrl: string | undefined;
  readonly apiKey: SecretRef | undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

/** Reads the check's settings; anything odd counts as unset. */
export function readThinSpecSettings(config: Readonly<Record<string, unknown>>): ThinSpecSettings {
  const shared = readTaggerSettings(config);
  const clarifier = text(config["thinSpecClarifier"]);
  return {
    forVersion: text(config["thinSpecCheckForVersion"]),
    clarifier: clarifier !== undefined && /^[\w-]+$/.test(clarifier) ? clarifier : undefined,
    anthropicKey: shared.anthropicKey,
    apiUrl: shared.apiUrl,
    apiKey: shared.apiKey,
  };
}

/** The settings of a check the board turned on, with the model it scores with. */
export interface ActiveThinSpecSettings {
  readonly model: ThinSpecModel;
  readonly clarifier: string | undefined;
  readonly anthropicKey: SecretRef;
  readonly apiUrl: string;
  readonly apiKey: SecretRef;
}

/**
 * The settings to check with when the board turned the check on for exactly
 * this version, every key it needs is set and a usable model is built in;
 * otherwise undefined.
 */
export function thinSpecOn(
  settings: ThinSpecSettings,
  version: string,
  model: ThinSpecModel | undefined,
): ActiveThinSpecSettings | undefined {
  const { forVersion, clarifier, anthropicKey, apiUrl, apiKey } = settings;
  if (forVersion !== version || model === undefined || !usableModel(model)) {
    return undefined;
  }
  if (anthropicKey === undefined || apiUrl === undefined || apiKey === undefined) {
    return undefined;
  }
  return { model, clarifier, anthropicKey, apiUrl, apiKey };
}
