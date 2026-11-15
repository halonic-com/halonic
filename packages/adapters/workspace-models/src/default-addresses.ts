/**
 * The address (host and port) of a model server on this computer whose
 * provider file gives no `baseUrl`, by provider type. The addresses are the
 * servers' own defaults, as the example providers write them.
 */
const defaultAddresses: Readonly<Record<string, string>> = {
  ollama: "localhost:11434",
  lmstudio: "localhost:1234",
};

/**
 * The host and port of a local model server of this type, or `undefined`
 * when the type has no default address.
 *
 * @example
 * defaultLocalAddress("lmstudio"); // "localhost:1234"
 */
export function defaultLocalAddress(type: string): string | undefined {
  return Object.hasOwn(defaultAddresses, type) ? defaultAddresses[type] : undefined;
}

/**
 * The API address of a model server on this computer whose provider file
 * gives no `baseUrl`, or `undefined` when its type has no default address.
 *
 * @example
 * defaultLocalBaseUrl("ollama"); // "http://localhost:11434/v1"
 */
export function defaultLocalBaseUrl(type: string): string | undefined {
  const address = defaultLocalAddress(type);
  return address === undefined ? undefined : `http://${address}/v1`;
}
