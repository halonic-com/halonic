import type { CliCommand } from "../../command.ts";
import type { DeploySetup } from "../../deploy-host.ts";
import { deployMessages } from "../../messages/deploy.ts";
import { deployPlanMessages } from "../../messages/deploy-plan.ts";
import { deployStatusMessages } from "../../messages/deploy-status.ts";
import { printable } from "../../output/printable.ts";
import { dirOption } from "../../workspace-dir.ts";
import { runDeploy } from "./run.ts";
import { showDeployStatus } from "./status.ts";

/**
 * `halonic deploy`, with the setup passed in so tests can fix the target,
 * the clock and the environment. A first word that isn't a subcommand is the
 * deployment to deploy; with `--plan`, the command shows what it would do.
 */
export function deployCommandWith(setup: DeploySetup): CliCommand {
  return {
    name: "deploy",
    usage: "[<deployment>] [--plan [--exit-code]] [--yes] [--dir <folder>]",
    argumentsBesideSubcommands: true,
    takesArguments: true,
    summary: deployStatusMessages.summary(),
    action: (input) => {
      const [deployment] = input.positionals;
      return deployMessages.action(deployment === undefined ? undefined : printable(deployment));
    },
    options: {
      plan: { type: "boolean", description: deployPlanMessages.planOption() },
      "exit-code": { type: "boolean", description: deployPlanMessages.exitCodeOption() },
      yes: { type: "boolean", description: deployMessages.yesOption() },
      dir: dirOption,
    },
    run: (input, context) => runDeploy(input, context, setup),
    subcommands: [
      {
        name: "status",
        usage: "<deployment> [--dir <folder>]",
        takesArguments: true,
        summary: deployStatusMessages.statusSummary(),
        action: (input) => deployStatusMessages.statusAction(printable(input.positionals[0] ?? "")),
        options: { dir: dirOption },
        run: (input, context) => showDeployStatus(input, context, setup),
      },
    ],
  };
}

/** `halonic deploy`: deploy the workspace to your own Cloudflare account, and see what's live there. */
export const deployCommand: CliCommand = deployCommandWith({});
