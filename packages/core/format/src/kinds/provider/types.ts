// The provider types a workspace's provider file can name. The run builds a
// provider for each of them, and `halonic validate` refuses any other, so
// both read this one list and can't drift apart (HAL-14260).

/** The types that speak OpenAI's chat completions API. */
export const openAiCompatibleTypes = ["openai", "openai-compatible", "ollama", "lmstudio"] as const;

/** Every type Halonic can call, in the order a fix lists them. */
export const providerTypes = ["anthropic", ...openAiCompatibleTypes, "mock"] as const;

/** One of {@link providerTypes}. */
export type ProviderType = (typeof providerTypes)[number];

/**
 * The types as a fix lists them: "anthropic, openai, openai-compatible,
 * ollama, lmstudio or mock".
 */
export const providerTypesInWords = `${providerTypes.slice(0, -1).join(", ")} or ${providerTypes.at(-1)}`;

/**
 * Whether Halonic can call a provider of this type.
 *
 * @example
 * isProviderType("anthropic"); // true
 * isProviderType("antropic"); // false
 */
export function isProviderType(type: string): type is ProviderType {
  return (providerTypes as readonly string[]).includes(type);
}
