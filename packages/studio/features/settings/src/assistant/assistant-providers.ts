/** The providers the Assistant can use, in the order the Provider select lists them. */
export const assistantProviders = [
  "not-set-up",
  "anthropic",
  "openai",
  "gemini",
  "ollama",
  "lmstudio",
  "openai-compatible",
] as const;

/** `not-set-up` leaves assistant chats to each workspace's model aliases. */
export type AssistantProvider = (typeof assistantProviders)[number];

/** What picking a provider fills in, and what the Model box suggests (`settings.ai-agent-provider-defaults`). */
export interface ProviderDefaults {
  /** The Provider select's label. */
  readonly label: string;
  /** The Base URL; empty means the provider's own. */
  readonly baseUrl: string;
  /** The name of the key, never the key; empty for a provider that needs none. */
  readonly secretName: string;
  /** Whether the model runs on this computer or the person's own network. */
  readonly local: boolean;
  /** The Model box's placeholder: the provider's usual model. */
  readonly modelPlaceholder: string;
}

/** The defaults of each provider. The secret names are only suggestions for the Secret name box; the key itself lives in the secret store. */
export const providerDefaults: Readonly<Record<AssistantProvider, ProviderDefaults>> = {
  "not-set-up": {
    label: "Not set up",
    baseUrl: "",
    secretName: "",
    local: false,
    modelPlaceholder: "",
  },
  anthropic: {
    label: "Anthropic",
    baseUrl: "",
    secretName: "anthropic-api-key",
    local: false,
    modelPlaceholder: "claude-sonnet-5-5",
  },
  openai: {
    label: "OpenAI",
    baseUrl: "",
    secretName: "openai-api-key",
    local: false,
    modelPlaceholder: "gpt-5",
  },
  gemini: {
    label: "Gemini",
    baseUrl: "",
    secretName: "gemini-api-key",
    local: false,
    modelPlaceholder: "gemini-2.5-pro",
  },
  ollama: {
    label: "Ollama (local)",
    baseUrl: "http://localhost:11434/v1",
    secretName: "",
    local: true,
    modelPlaceholder: "llama3.2",
  },
  lmstudio: {
    label: "LM Studio (local)",
    baseUrl: "http://localhost:1234/v1",
    secretName: "",
    local: true,
    modelPlaceholder: "",
  },
  "openai-compatible": {
    label: "OpenAI-compatible",
    baseUrl: "",
    secretName: "",
    local: false,
    modelPlaceholder: "",
  },
};

/** The three fields a provider fills in. */
export interface ProviderFields {
  readonly baseUrl: string;
  readonly secretName: string;
  readonly local: boolean;
}

/**
 * The fields after picking `to` while `from` was set: a field still holding `from`'s default takes
 * `to`'s, and one the person changed keeps their value (`settings.ai-agent-provider-defaults`).
 *
 * @example
 * pickProvider({ baseUrl: "", secretName: "anthropic-api-key", local: false }, "anthropic", "openai");
 * // { baseUrl: "", secretName: "openai-api-key", local: false }
 */
export function pickProvider(
  current: ProviderFields,
  from: AssistantProvider,
  to: AssistantProvider,
): ProviderFields {
  const was = providerDefaults[from];
  const next = providerDefaults[to];
  return {
    baseUrl: current.baseUrl === was.baseUrl ? next.baseUrl : current.baseUrl,
    secretName: current.secretName === was.secretName ? next.secretName : current.secretName,
    local: current.local === was.local ? next.local : current.local,
  };
}
