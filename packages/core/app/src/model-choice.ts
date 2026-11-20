// What the first run's Pick a model screen lets a person choose, and the one
// table of what each choice means in the workspace's files. To move a
// provider to another model later, change its row here: nothing else names it.

/** The providers a person can paste a key for on the first run's model screen. */
export const firstRunKeyProviders = ["anthropic", "openai", "gemini"] as const;

/** One of {@link firstRunKeyProviders}. */
export type FirstRunKeyProvider = (typeof firstRunKeyProviders)[number];

/**
 * What a person picked on the model screen:
 * - `key`: a key from one of the cloud providers; Studio picks its model.
 * - `local`: a model Ollama on this computer has downloaded, by its name.
 *
 * Sample answers isn't one: it changes nothing, so there is nothing to test or save.
 */
export type ModelChoice =
  | { readonly kind: "key"; readonly provider: FirstRunKeyProvider }
  | { readonly kind: "local"; readonly model: string };

/** A provider as the first run writes it: its file in `providers/` and the model it uses. */
export interface FirstRunProvider {
  /** The provider's id, which is also its file name: `providers/<id>.yaml`. */
  readonly id: string;
  /** The provider's name, as people know it. */
  readonly name: string;
  /** The adapter type its file gives. */
  readonly type: string;
  /** The address its file gives; `undefined` when the adapter knows it. */
  readonly baseUrl: string | undefined;
  /** The name of the key its file gives, as Settings suggests it; `undefined` for a local provider. */
  readonly secretName: string | undefined;
  /** Whether its models run on this computer. */
  readonly local: boolean;
  /** The model the first run points the `default` alias at; empty for Ollama, whose model the person picks. */
  readonly model: string;
  /** How its keys start, for "It usually starts with …"; empty for a local provider. */
  readonly keyStart: string;
  /** The text of `providers/<id>.yaml` when the workspace doesn't have one. */
  readonly fileText: string;
}

const keyComment = "# The name of the key, never the key. The key is kept in the secret store.";

/**
 * The cloud providers of the model screen. Each one's model is its cheapest
 * current general model, checked on the providers' model pages on 19 Nov
 * 2026: Claude Haiku 5.5, GPT-6 Luna and Gemini 3.1 Flash-Lite (Gemini 2.5
 * Flash-Lite is closed to new accounts). Gemini goes through its
 * OpenAI-compatible API, as Halonic has no Gemini adapter of its own.
 */
export const firstRunProviders: Readonly<Record<FirstRunKeyProvider, FirstRunProvider>> = {
  anthropic: {
    id: "anthropic",
    name: "Anthropic",
    type: "anthropic",
    baseUrl: undefined,
    secretName: "anthropic-api-key",
    local: false,
    model: "claude-haiku-5-5",
    keyStart: "sk-ant-",
    fileText: `id: anthropic\nname: Anthropic\ntype: anthropic\n${keyComment}\nsecret: anthropic-api-key\n`,
  },
  openai: {
    id: "openai",
    name: "OpenAI",
    type: "openai",
    baseUrl: undefined,
    secretName: "openai-api-key",
    local: false,
    model: "gpt-6-luna",
    keyStart: "sk-",
    fileText: `id: openai\nname: OpenAI\ntype: openai\n${keyComment}\nsecret: openai-api-key\n`,
  },
  gemini: {
    id: "gemini",
    name: "Gemini",
    type: "openai-compatible",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    secretName: "gemini-api-key",
    local: false,
    model: "gemini-3.1-flash-lite",
    keyStart: "AIza",
    fileText:
      "id: gemini\nname: Gemini\n# Gemini's OpenAI-compatible API.\ntype: openai-compatible\n" +
      `baseUrl: https://generativelanguage.googleapis.com/v1beta/openai\n${keyComment}\nsecret: gemini-api-key\n`,
  },
};

/** Ollama on this computer, the one local model server the model screen looks for in v0.1. */
export const firstRunLocalProvider: FirstRunProvider = {
  id: "ollama",
  name: "Ollama",
  type: "ollama",
  baseUrl: "http://localhost:11434/v1",
  secretName: undefined,
  local: true,
  model: "",
  keyStart: "",
  fileText:
    "id: ollama\nname: Ollama (this computer)\ntype: ollama\nbaseUrl: http://localhost:11434/v1\nlocal: true\n",
};

/** The provider a choice uses: its key provider's row, or Ollama. */
export function choiceProvider(choice: ModelChoice): FirstRunProvider {
  return choice.kind === "key" ? firstRunProviders[choice.provider] : firstRunLocalProvider;
}

/** The model a choice points the `default` alias at. */
export function choiceModel(choice: ModelChoice): string {
  return choice.kind === "key" ? firstRunProviders[choice.provider].model : choice.model;
}

/** How long the test may wait for the first answer from a cloud provider: a wrong key found here costs 5 seconds. */
export const keyTestTimeLimitMs = 5_000;

/** How long the test may wait for a local model to start its reply: the first time loads it, which can take minutes. */
export const localTestTimeLimitMs = 180_000;

/** How long the test of a choice may wait for the first answer, in milliseconds. */
export function testTimeLimitMs(choice: ModelChoice): number {
  return choice.kind === "key" ? keyTestTimeLimitMs : localTestTimeLimitMs;
}

/**
 * Why pasted text isn't a key, found before any call:
 * - `empty`: nothing was pasted.
 * - `spaces`: it has a space or a line break inside.
 * - `url`: it is a web address.
 * - `wrong-start`: it doesn't start the way the provider's keys do, or is another provider's key.
 *
 * `keyStart` is how the provider's keys start, for "It usually starts with …".
 */
export interface KeyProblem {
  readonly kind: "empty" | "spaces" | "url" | "wrong-start";
  readonly keyStart: string;
}

/**
 * Says why `text` can't be a key for `provider`, or `undefined` when it may
 * be one. Spaces and line breaks around it are ignored, as a paste often
 * brings them: the key to test and save is `text.trim()`.
 *
 * @example
 * keyProblem("anthropic", "https://console.anthropic.com/settings/keys");
 * // { kind: "url", keyStart: "sk-ant-" }
 */
export function keyProblem(provider: FirstRunKeyProvider, text: string): KeyProblem | undefined {
  const { keyStart } = firstRunProviders[provider];
  const key = text.trim();
  if (key === "") return { kind: "empty", keyStart };
  if (/\s/.test(key)) return { kind: "spaces", keyStart };
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(key) || key.startsWith("www."))
    return { kind: "url", keyStart };
  if (!key.startsWith(keyStart) || isOtherProvidersKey(provider, key)) {
    return { kind: "wrong-start", keyStart };
  }
  return undefined;
}

/** An Anthropic key also starts with OpenAI's `sk-`, so OpenAI checks for it. */
function isOtherProvidersKey(provider: FirstRunKeyProvider, key: string): boolean {
  return firstRunKeyProviders.some((other) => {
    const otherStart = firstRunProviders[other].keyStart;
    return (
      other !== provider &&
      otherStart.length > firstRunProviders[provider].keyStart.length &&
      key.startsWith(otherStart)
    );
  });
}
