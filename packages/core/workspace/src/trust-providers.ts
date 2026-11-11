// The part of the trust content that model providers add (HAL-5200): where
// each one sends its requests and which secret goes with them. A model call
// sends the provider's key to its `baseUrl`, so a change to either asks for
// trust again, as a change to a connector's URL does.

import type { Provider } from "@halonicjs/format";
import { secretReference } from "./trust-secret.ts";
import { trustUrl } from "./trust-url.ts";

/** One model provider's part of the trust content. */
export interface ProviderTrustContent {
  id: string;
  /** The adapter, such as `anthropic` or `ollama`, so switching it is a change. */
  type: string;
  /**
   * The address requests go to, normalised (see {@link trustUrl}). Only
   * there when the file names one; without it the adapter's own address is used.
   */
  baseUrl?: string;
  /** The secret that holds the key, by name only: `‹secret NAME›`. */
  secret?: string;
  local: boolean;
  /** The adapter's settings as written. Only there when there are some. */
  options?: Record<string, unknown>;
}

/** A provider that can't be trusted, and why. Its address stays out, as it may hold a password. */
export interface RefusedProvider {
  id: string;
  reason: string;
}

/** What {@link providersTrustContent} gives: the providers that can be trusted, and those that can't. */
export interface ProvidersTrustContent {
  /** Sorted by id. */
  providers: ProviderTrustContent[];
  /** Sorted by id. */
  refused: RefusedProvider[];
}

/**
 * The trust content of a workspace's model providers, sorted by id. The
 * test model (`mock`) sends nothing anywhere, so it isn't listed. A provider
 * whose `baseUrl` `trustUrl` refuses goes in `refused`, like a connector's.
 * Only its name stays out, as it decides nothing.
 *
 * @example
 * providersTrustContent([{ id: "claude", type: "anthropic", secret: "anthropic-key", local: false, options: {} }]);
 * // { providers: [{ id: "claude", type: "anthropic", secret: "‹secret anthropic-key›", local: false }], refused: [] }
 */
export function providersTrustContent(providers: readonly Provider[]): ProvidersTrustContent {
  const trusted: ProviderTrustContent[] = [];
  const refused: RefusedProvider[] = [];
  for (const provider of providers) {
    if (provider.type === "mock") {
      continue;
    }
    const content = providerContent(provider);
    if ("reason" in content) {
      refused.push(content);
    } else {
      trusted.push(content);
    }
  }
  trusted.sort((left, right) => compareText(left.id, right.id));
  refused.sort((left, right) => compareText(left.id, right.id));
  return { providers: trusted, refused };
}

function providerContent(provider: Provider): ProviderTrustContent | RefusedProvider {
  const baseUrl = provider.baseUrl === undefined ? undefined : trustUrl(provider.baseUrl);
  if (baseUrl !== undefined && "refused" in baseUrl) {
    return { id: provider.id, reason: baseUrl.refused };
  }
  const { options } = provider;
  return {
    id: provider.id,
    type: provider.type,
    ...(baseUrl === undefined ? {} : { baseUrl: baseUrl.url }),
    ...(provider.secret === undefined ? {} : { secret: secretReference(provider.secret) }),
    local: provider.local,
    ...(Object.keys(options).length === 0 ? {} : { options: { ...options } }),
  };
}

/** Compares by code unit, so the order is the same on every machine and locale. */
function compareText(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}
