import type { ProviderText } from "@halonicjs/events";
import { isVendorErrorText } from "@halonicjs/ports";

/**
 * The model provider's own error text for the run log, from the `cause` of
 * the error a model call threw (requirement `engine.provider-text`). Only a
 * `VendorErrorText` gives one: the provider shortened that text and checked
 * it for keys. Any other `cause`, such as a network error or a reply that
 * didn't parse, gives none, because nothing checked what it holds.
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
  const { status, message: text } = error.cause;
  return status === undefined ? { text } : { status, text };
}
