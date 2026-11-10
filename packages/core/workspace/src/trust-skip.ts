// When a run needs no trust (Liam, HAL-1984): a workspace whose runs can
// only reach the built-in test model starts nothing outside Halonic, so
// `init --example acme` runs straight away. The rule reads the trust content
// itself, so whatever trust comes to cover next turns the skip off too.
// The CLI's `halonic run` and Studio both ask it.
//
// A local integration turns it off even when it adds nothing to the trust
// content (all its hosts are fixed): its code runs and reaches its hosts,
// so the run reaches more than the test model.

import type { Provider } from "@halonicjs/format";
import { type TrustContent, type TrustContentInput, trustContent } from "./trust-content.ts";

/** What {@link reachesOnlyTheTestModel} reads: the trust content's input, and the providers. */
export interface TrustSkipInput extends TrustContentInput {
  /** The workspace's model providers, as parsed from their files. */
  readonly providers: readonly Provider[];
}

/**
 * Whether a run in this workspace can only reach the test model: every
 * provider is `mock`, there is no local integration, and the trust content
 * is empty, so there is no connector and no agent that starts a harness
 * program either. Such a run needs no trust.
 *
 * @example
 * reachesOnlyTheTestModel({ providers: [mockProvider], connectors: [] }); // true
 * reachesOnlyTheTestModel({ providers: [mockProvider], connectors: [mailConnector] }); // false
 */
export function reachesOnlyTheTestModel(input: TrustSkipInput): boolean {
  return (
    input.providers.every((provider) => provider.type === "mock") &&
    (input.integrations ?? []).length === 0 &&
    isEmpty(trustContent(input))
  );
}

/** Whether every part of the trust content is empty or left out. */
function isEmpty(content: TrustContent): boolean {
  return Object.values(content).every((part) => part === undefined || part.length === 0);
}
