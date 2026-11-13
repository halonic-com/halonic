// The local integrations whose sheets a run may take declared tools from
// (requirement `workspace.declared-tools`): only when a trust check passed.

import type { TrustGrant } from "@halonicjs/ports";
import type { LocalIntegrationInput } from "@halonicjs/workspace";
import { workspaceIntegrations } from "./workspace-trust.ts";

/**
 * The workspace's local integrations as a run starts, or none when `grant` is
 * `null`: a workspace nobody trusted, or one that can only reach the test
 * model, has no sheet a person approved, so no tool gets a noun from one.
 *
 * With a grant, the integrations are read the way the trust check read them,
 * so a sheet that changed since the person approved it no longer matches
 * its trust and its runner doesn't start.
 *
 * @param grant - the grant of the trust check the run passed, or `null` for none
 * @param root - the workspace folder
 * @param shown - the folder as the user typed it
 */
export async function approvedIntegrations(
  grant: TrustGrant | null,
  root: string,
  shown: string = root,
): Promise<LocalIntegrationInput[]> {
  return grant === null ? [] : await workspaceIntegrations(root, shown);
}
