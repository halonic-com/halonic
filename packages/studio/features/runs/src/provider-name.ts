// A model provider as a person knows it (microcopy 1.6, E6): by the `name` its file gives, never
// by its id with a capital, which reads "Openai" and "Lmstudio". The run log only holds the id.

/** The providers Halonic ships, by the id their file usually has, as their makers write them. */
const knownProviderNames: ReadonlyMap<string, string> = new Map([
  ["anthropic", "Anthropic"],
  ["openai", "OpenAI"],
  ["gemini", "Gemini"],
  ["ollama", "Ollama"],
  ["lmstudio", "LM Studio"],
]);

/**
 * The provider's name for a sentence: the name its file gives, else the known name for its id
 * (for a provider whose file names none, or that is no longer in the workspace), else the id as
 * written.
 *
 * @param named - the workspace's lookup of a provider's `name`; `undefined` where the page has none
 *
 * @example
 * providerNameOf("openai", () => undefined); // "OpenAI"
 * providerNameOf("work", (id) => (id === "work" ? "Work GPT" : undefined)); // "Work GPT"
 * providerNameOf("my-server", undefined); // "my-server"
 */
export function providerNameOf(
  providerId: string,
  named: ((providerId: string) => string | undefined) | undefined,
): string {
  return named?.(providerId) ?? knownProviderNames.get(providerId) ?? providerId;
}
