/** The address a provider type calls when its YAML has no `baseUrl`, for the types that have a usual one. */
const defaultBaseUrls: Readonly<Record<string, string>> = {
  openai: "https://api.openai.com/v1",
  ollama: "http://localhost:11434/v1",
  lmstudio: "http://localhost:1234/v1",
};

/**
 * The address a provider of this type calls when it sets no `baseUrl`, or
 * undefined when the type has no usual address. The adapters' presets and
 * the cost rules both read this one table, so they can't drift apart.
 *
 * @example
 * defaultBaseUrl("ollama"); // "http://localhost:11434/v1"
 * defaultBaseUrl("openai-compatible"); // undefined
 */
export function defaultBaseUrl(type: string): string | undefined {
  return Object.hasOwn(defaultBaseUrls, type) ? defaultBaseUrls[type] : undefined;
}
