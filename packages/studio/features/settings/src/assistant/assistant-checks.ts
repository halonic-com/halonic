import { isSecretName } from "@halonicjs/ports";
import { turnLimitRange } from "./assistant-prefs.ts";
import { type AssistantProvider, providerDefaults } from "./assistant-providers.ts";

/** What a field check says: the value to save, or the Field error to show (nothing is saved then). */
export type FieldCheck<Value> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly error: string };

/**
 * Checks the Model box when the person leaves it. With no provider it may be empty; with one it
 * can't be (`settings.ai-agent-fields`).
 *
 * @example
 * checkModel("anthropic", " "); // { ok: false, error: "Enter a model name, like claude-sonnet-5-5." }
 */
export function checkModel(provider: AssistantProvider, text: string): FieldCheck<string> {
  const model = text.trim();
  if (model === "" && provider !== "not-set-up") {
    const example = providerDefaults[provider].modelPlaceholder || "llama-3.1-8b-instruct";
    return { ok: false, error: `Enter a model name, like ${example}.` };
  }
  return { ok: true, value: model };
}

const BASE_URL_ERROR = "Enter a full address, like http://localhost:8000/v1.";

/**
 * Checks the Base URL box when the person leaves it. Empty means the provider's own, except for
 * OpenAI-compatible, which needs one.
 */
export function checkBaseUrl(provider: AssistantProvider, text: string): FieldCheck<string> {
  const address = text.trim();
  if (address === "") {
    return provider === "openai-compatible"
      ? { ok: false, error: BASE_URL_ERROR }
      : { ok: true, value: "" };
  }
  try {
    const url = new URL(address);
    const isWebAddress = url.protocol === "http:" || url.protocol === "https:";
    // A name and password in the address would be saved in plain text; only a secret's name is kept.
    if (isWebAddress && url.hostname !== "" && url.username === "" && url.password === "") {
      return { ok: true, value: address };
    }
  } catch {
    // Not an address: the same error as any other wrong one.
  }
  return { ok: false, error: BASE_URL_ERROR };
}

/** Checks the Secret name box: empty (no key) or a name a secret can have. */
export function checkSecretName(text: string): FieldCheck<string> {
  const name = text.trim();
  if (name === "" || isSecretName(name)) return { ok: true, value: name };
  return {
    ok: false,
    error: "Use a letter first, then letters, numbers, - or _, like anthropic-api-key.",
  };
}

/**
 * Checks the Turn limit box. Empty means the default 16 and gives `undefined`, so the setting is
 * put back to its default; anything but a whole number from 1 to 64 is an error.
 */
export function checkTurnLimit(text: string): FieldCheck<number | undefined> {
  const typed = text.trim();
  if (typed === "") return { ok: true, value: undefined };
  const number = /^\d{1,3}$/.test(typed) ? Number(typed) : Number.NaN;
  if (number >= turnLimitRange.min && number <= turnLimitRange.max) {
    return { ok: true, value: number };
  }
  return {
    ok: false,
    error: `Enter a whole number from ${turnLimitRange.min} to ${turnLimitRange.max}.`,
  };
}
