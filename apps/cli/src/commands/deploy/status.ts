// `halonic deploy status <deployment>`: what's live on a deployment (deploy
// flow 5.1). A thin command over the deploy app service's `status`: the
// service checks the account and asks the target, this file finds the
// deployment in `deployments.yaml` and says what came back.

import { chooseDeployment } from "@halonicjs/app";
import { systemClock } from "@halonicjs/std";
import { filesOf, loadWorkspace } from "@halonicjs/workspace";
import {
  type CommandContext,
  type CommandInput,
  type CommandResult,
  UsageError,
} from "../../command.ts";
import { type DeploySetup, deployServiceOf } from "../../deploy-host.ts";
import { deployStatusMessages } from "../../messages/deploy-status.ts";
import { deployStatusResult } from "../../output/deploy-status.ts";
import { halonicVersion } from "../../version.ts";
import { openWorkspaceDir } from "../../workspace-dir.ts";
import { workspaceNameOf } from "../../workspace-trust.ts";

/**
 * Shows what's live on the named deployment. It changes nothing on the host.
 *
 * @throws UsageError without a deployment's name, or with more than one
 * @throws KindedError from the deploy app service, as its requirements say
 */
export async function showDeployStatus(
  input: CommandInput,
  context: CommandContext,
  setup: DeploySetup,
): Promise<CommandResult> {
  const [name, ...extra] = input.positionals;
  if (name === undefined || extra.length > 0) {
    throw new UsageError(deployStatusMessages.statusNeedsName());
  }
  const dir = await openWorkspaceDir(input, context);
  const workspace = await loadWorkspace(dir.store);
  const deployments = filesOf(workspace, "deployments")[0]?.value.deployments ?? {};
  const chosen = chooseDeployment(
    workspaceNameOf(workspace, dir),
    deployments,
    name,
    workspace.files,
  );
  if (chosen.kind === "none") throw new UsageError(deployStatusMessages.statusNeedsName());
  const { host } = chosen.deployment;
  const status = await deployServiceOf(setup).status(host, chosen.id, chosen.deployment);
  return deployStatusResult(status, {
    deployment: chosen.id,
    host: host === "cloudflare" ? "Cloudflare" : host,
    halonicVersion,
    clock: {
      now: (setup.clock ?? systemClock).now(),
      ...(setup.timeZone === undefined ? {} : { timeZone: setup.timeZone }),
    },
  });
}
