// The provider types a workspace's provider file can name. `workspaceProvider`
// builds a provider for each of them, and a fix that asks for a known type
// lists them from here, so the list and the adapters can't drift apart.

/** The types that speak OpenAI's chat completions API. */
export const openAiCompatibleTypes = ["openai", "openai-compatible", "ollama", "lmstudio"] as const;

/** Every type `workspaceProvider` can call, in the order a fix lists them. */
export const providerTypes = ["anthropic", ...openAiCompatibleTypes, "mock"] as const;
