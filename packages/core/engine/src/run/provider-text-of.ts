import type { ProviderText } from "@halonicjs/events";
import { isVendorErrorText } from "@halonicjs/ports";
import { findSecretShape } from "@halonicjs/std";

/**
 * The most characters of provider text the run log keeps. It matches what
 * the Anthropic and OpenAI adapters keep, so their texts pass unchanged.
 */
const maxProviderText = 300;

/**
 * The model provider's own error text for the run log, from the `cause` of
 * the error a model call threw (requirement `engine.provider-text`). Only a
 * `VendorErrorText` gives one: the provider shortened that text and checked
 * it for keys. Any other `cause`, such as a network error or a reply that
 * didn't parse, gives none, because nothing checked what it holds.
 *
 * The engine doesn't rely on every adapter doing that right. It checks the
 * text for keys once more and drops it when one turns up, and it keeps at
 * most {@link maxProviderText} characters, with "…" after a cut.
 *
 * It is checked by name and fields, not `instanceof`, because an adapter may
 * have its own copy of `@halonicjs/ports`.
 *
 * @example
 * providerTextOf(new ModelCallError("refused", "…", { cause: new VendorErrorText(400, "too long") }));
 * // { status: 400, text: "too long" }
 */
export function providerTextOf(error: unknown): ProviderText | undefined {
  if (!(error instanceof Error) || !isVendorErrorText(error.cause)) return undefined;
  const { status, message } = error.cause;
  // Check the whole text, before the cut: half a key is still a leak.
  if (message === "" || findSecretShape(message) !== undefined) return undefined;
  const text = capped(message);
  return status === undefined ? { text } : { status, text };
}

/** `text`, cut to {@link maxProviderText} characters with "…" when it is longer. */
function capped(text: string): string {
  return text.length > maxProviderText ? `${text.slice(0, maxProviderText)}…` : text;
}
