// The keys Studio serves a sandboxed harness agent's bridge (HAL-13795): the
// CLI's `ProviderKeyServices`, on the workspace the engine loaded, the
// keychain and the model calls' own check before a key is sent, with
// Studio's words for a missing key.
//
// The agent host's bridge can't reach a provider's own address (`baseUrl`)
// yet (HAL-13798), so Studio refuses such a provider before the key is read
// or the program starts, and says so plainly, rather than let the bridge
// refuse every call of a program that already runs.

import type { Provider } from "@halonicjs/format";
import { type ModelAliasRules, ProviderKeyServices } from "@halonicjs/host-harness-host";
import type { Secrets } from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import type { LoadedWorkspace } from "@halonicjs/workspace";

/** What the engine gives for a sandboxed agent's provider key. */
export interface StudioKeyParts {
  /** The workspace the engine loaded, whose provider files and model aliases pick the key. */
  workspace(): LoadedWorkspace;
  /** The keychain the key's value is read from, only once the bridge asks for it. */
  readonly secrets: Secrets;
  /**
   * The model calls' check that a key may go to a provider's address: its
   * type's own, or the workspace is trusted, and it is on the key's allowed
   * addresses. The engine binds it to the workspace's trust and the keys'
   * allowed addresses, so a harness agent and a model call refuse alike.
   */
  requireKeyMayGo(file: Provider): Promise<void>;
  /** The model calls' rules for an agent whose `model` is an alias, bound alike (HAL-12488). */
  readonly aliases: ModelAliasRules;
}

/**
 * The bridge services of Studio's harness agents, with the keys' scrub.
 *
 * @example
 * const keys = studioProviderKeys({ workspace: () => workspace, secrets, requireKeyMayGo, aliases });
 * new AgentHostBridges(transport, { servicesFor: keys.servicesFor.bind(keys), scrub: keys.scrub });
 */
export function studioProviderKeys(parts: StudioKeyParts): ProviderKeyServices {
  return new ProviderKeyServices({
    workspace: parts.workspace,
    secrets: parts.secrets,
    requireKeyMayGo: async (file) => {
      refuseOwnAddress(file);
      await parts.requireKeyMayGo(file);
    },
    missingKeyText: (secret, providerId) =>
      `The secret "${secret}" that holds provider ${providerId}'s key isn't saved on this computer, so the sandboxed agent can't call its model. Save it in Settings › Models.`,
    aliases: parts.aliases,
  });
}

/**
 * Refuses a provider with its own address, which the agent host's bridge
 * can't send calls to yet (HAL-13798).
 *
 * @throws KindedError `invalid_input` naming the provider and saying what works instead
 */
function refuseOwnAddress(file: Pick<Provider, "id" | "baseUrl">): void {
  if (file.baseUrl === undefined) return;
  throw new KindedError(
    "invalid_input",
    `Studio can't send a sandboxed agent's calls to provider ${file.id}'s own address (${file.baseUrl}) yet, so its key isn't used.`,
    {
      fix: `Run this workflow with halonic run, or point the agent's model at a provider without its own address.`,
    },
  );
}
