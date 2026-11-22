// The local integrations whose sheets a run may take declared tools from
// (requirement `workspace.declared-tools`): only when a trust check passed.

import type { TrustGrant } from "@halonicjs/ports";
import type { LocalIntegrationInput } from "@halonicjs/workspace";

/**
 * The local integrations of the version a run starts, or `undefined` when
 * `grant` is `null`: a workspace nobody trusted, or one that can only reach the test
 * model, has no sheet a person approved, so no tool gets a noun from one. `undefined` (not an empty list) is what
 * leaves `declaredTools` out of the run's definitions.
 *
 * With a grant, they are the integrations the trust check read, from the
 * same version, so a sheet that changed since the person approved it no
 * longer matches its trust and its runner doesn't start.
 *
 * @param grant - the grant of the trust check the run passed, or `null` for none
 * @param integrations - the local integrations of the version the run starts, as its trust check read them
 */
export function approvedIntegrations(
  grant: TrustGrant | null,
  integrations: readonly LocalIntegrationInput[],
): LocalIntegrationInput[] | undefined {
  return grant === null ? undefined : [...integrations];
}
