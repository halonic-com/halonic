// The billing pages Halonic knows (UX check R4): only Anthropic's, OpenAI's and Gemini's. A
// provider that calls another address, such as a proxy or a company gateway, is billed somewhere
// Halonic can't know, so it gets no link.

import type { FailedModel } from "@halonicjs/app/run-failure";

/** A provider file, as a failed run's model names it. */
type Provider = NonNullable<FailedModel["provider"]>;

/** Each provider's own API host, and the page where its account's credit is added. */
const billingPages: ReadonlyMap<string, string> = new Map([
  ["api.anthropic.com", "https://console.anthropic.com/settings/billing"],
  ["api.openai.com", "https://platform.openai.com/settings/organization/billing/overview"],
  // Google's billing guide, which links to the account's own page in AI Studio.
  ["generativelanguage.googleapis.com", "https://ai.google.dev/gemini-api/docs/billing"],
]);

/** The API host a provider of this type calls when its file gives no `baseUrl`. */
const defaultHosts: Readonly<Record<string, string>> = {
  anthropic: "api.anthropic.com",
  openai: "api.openai.com",
};

/**
 * The billing page of the account behind a provider: by the host its `baseUrl` names, or else by
 * the default host of its type.
 *
 * @returns `undefined` for any other provider, or a `baseUrl` that isn't an address
 *
 * @example
 * billingPageOf({ type: "anthropic", … }); // "https://console.anthropic.com/settings/billing"
 * billingPageOf({ type: "openai-compatible", baseUrl: "https://gateway.acme.example/v1", … }); // undefined
 */
export function billingPageOf(provider: Provider): string | undefined {
  const host =
    provider.baseUrl === undefined ? defaultHosts[provider.type] : hostOf(provider.baseUrl);
  return host === undefined ? undefined : billingPages.get(host);
}

function hostOf(address: string): string | undefined {
  return URL.canParse(address) ? new URL(address).host : undefined;
}
