// The CLI's provider key services (HAL-13795): the host's shared
// `ProviderKeyServices`, bound to the CLI's trust, its keys' allowed
// addresses and its words. The bridge then refuses a key with the same check
// and the same words as the built-in loop's model calls, aliases included
// (HAL-12488).

import {
  harnessModelAccess,
  harnessProviderModel,
  requireKeyMayGo,
} from "@halonicjs/adapter-workspace-models";
import {
  type BridgeAgent,
  type ProviderAccessChoice,
  ProviderKeyServices,
} from "@halonicjs/host-harness-host";
import type { KeyOrigins, Secrets } from "@halonicjs/ports";
import type { LoadedWorkspace } from "@halonicjs/workspace";

/** What {@link cliProviderKeys} binds. */
export interface CliProviderKeysInput {
  /** The workspace the engine runs now. */
  workspace(): LoadedWorkspace;
  /** The remembered secrets `runCli` wraps, never a raw adapter (`apps/cli/AGENTS.md`). */
  readonly secrets: Secrets;
  /** Whether the workspace is trusted on this computer. */
  readonly trusted: boolean;
  /** The origins each stored key may be sent to. */
  readonly keyOrigins: KeyOrigins;
  /** Hears the access each agent's bridge got, by provider and secret name, never a value. */
  reportAccess?(agent: BridgeAgent, choice: ProviderAccessChoice): void;
}

/** The bridge's key services as the CLI's model calls would check them. */
export function cliProviderKeys(input: CliProviderKeysInput): ProviderKeyServices {
  const checks = { trusted: input.trusted, keyOrigins: input.keyOrigins };
  return new ProviderKeyServices({
    workspace: input.workspace,
    secrets: input.secrets,
    requireKeyMayGo: (file) => requireKeyMayGo(file, checks),
    missingKeyText: (secret, providerId) =>
      `The secret "${secret}" that holds provider ${providerId}'s key isn't saved on this computer, so the sandboxed agent can't call its model. Save it with: halonic secret set ${secret}`,
    aliases: {
      providerModel: harnessProviderModel,
      access: (workspace, hubId, name, harness) =>
        harnessModelAccess(workspace, hubId, name, harness, {
          isTrusted: () => input.trusted,
          keyOrigins: input.keyOrigins,
        }),
    },
    ...(input.reportAccess === undefined ? {} : { reportAccess: input.reportAccess }),
  });
}
