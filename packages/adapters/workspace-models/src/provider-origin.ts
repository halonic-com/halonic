// Where a provider's stored key goes, and whether that is the place the
// provider's type is known for. One function, read by the model resolver for
// every call, so the CLI, the Studio and the agent editor's unsaved settings
// decide the same way (HAL-11342).

import { anthropicBaseUrl } from "@halonicjs/adapter-model-anthropic";
import { defaultBaseUrl } from "@halonicjs/ports";
import type { ProviderFile } from "./workspace-providers.ts";

/** Where one provider sends its stored key. */
export interface KeyDestination {
  /** The provider's id, as its file names it. */
  readonly provider: string;
  /**
   * The scheme, host and port the key goes to, such as `https://api.example.com`, or
   * `an address that can't be read` when the address doesn't parse or holds a
   * user name or password. Never the path, query or user info.
   */
  readonly origin: string;
  /** Whether the origin is the built-in one of the provider's type, so the key stays where its type sends it. */
  readonly isDefault: boolean;
}

const unreadable = "an address that can't be read";

/**
 * The built-in address of a provider type: Anthropic's own, or the table the
 * cost rules read ({@link defaultBaseUrl}). `undefined` for a type with none,
 * such as `openai-compatible`.
 */
function builtInAddress(type: string): string | undefined {
  return type === "anthropic" ? anthropicBaseUrl : defaultBaseUrl(type);
}

/** The origin of an address, or `undefined` when it doesn't parse or holds user info. */
function plainOrigin(address: string): string | undefined {
  const url = URL.parse(address);
  if (url === null || url.username !== "" || url.password !== "") {
    return undefined;
  }
  return url.origin === "null" ? undefined : url.origin;
}

/**
 * Where the provider sends its stored key, or `undefined` when it has no
 * stored key (no `secret`, or the mock model), so there is nothing to protect.
 *
 * The origin is default only when `baseUrl` is left out, or parses to the
 * same scheme, host and port as the type's built-in address. A type with no
 * built-in address, `http` where the built-in one is `https`, user info, an IP
 * literal and a look-alike host all differ from it, so they are not default.
 *
 * @example
 * keyDestination({ id: "main", type: "openai", secret: "k", baseUrl: "https://llm.example.com/v1", … });
 * // { provider: "main", origin: "https://llm.example.com", isDefault: false }
 */
export function keyDestination(
  file: Pick<ProviderFile, "id" | "type" | "baseUrl" | "secret">,
): KeyDestination | undefined {
  if (file.type === "mock" || file.secret === undefined) {
    return undefined;
  }
  const builtIn = builtInAddress(file.type);
  const builtInOrigin = builtIn === undefined ? undefined : plainOrigin(builtIn);
  if (file.baseUrl === undefined) {
    return {
      provider: file.id,
      origin: builtInOrigin ?? unreadable,
      isDefault: builtInOrigin !== undefined,
    };
  }
  const origin = plainOrigin(file.baseUrl);
  return {
    provider: file.id,
    origin: origin ?? unreadable,
    isDefault: origin !== undefined && origin === builtInOrigin,
  };
}
