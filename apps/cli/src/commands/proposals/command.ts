import type { CliCommand } from "../../command.ts";
import { proposalsMessages } from "../../messages/proposals.ts";
import { printable } from "../../output/printable.ts";
import { dirOption, workspaceDir } from "../../workspace-dir.ts";
import { acceptProposal, discardProposal } from "./decide.ts";
import { listProposals } from "./list.ts";
import type { ProposalsSetup } from "./open-proposals.ts";
import { showProposal } from "./show.ts";

/** This computer's clock, profile and git. */
const computerProposalsSetup: ProposalsSetup = { clock: () => ({ now: new Date() }) };

/**
 * `halonic proposals`, with the setup passed in so tests can fix the clock
 * and the profile folder (HAL-6477, board yes on HAL-9332).
 */
export function proposalsCommandWith(setup: ProposalsSetup): CliCommand {
  return {
    name: "proposals",
    usage: "[--dir <folder>]",
    summary: proposalsMessages.summary(),
    action: (input, context) =>
      proposalsMessages.action(printable(workspaceDir(input, context.cwd).name)),
    options: { dir: dirOption },
    subcommands: [
      {
        name: "show",
        usage: "<run-id> [--dir <folder>]",
        takesArguments: true,
        summary: proposalsMessages.showSummary(),
        action: (input) => proposalsMessages.showAction(printable(input.positionals[0] ?? "")),
        options: { dir: dirOption },
        run: (input, context) => showProposal(input, context, setup),
      },
      {
        name: "accept",
        usage: "<run-id> [<file>] [--dir <folder>]",
        summary: proposalsMessages.acceptSummary(),
        action: (input) => proposalsMessages.acceptAction(printable(input.positionals[0] ?? "")),
        options: { dir: dirOption },
        run: (input, context) => acceptProposal(input, context, setup),
      },
      {
        name: "discard",
        usage: "<run-id> [<file>] [--dir <folder>]",
        summary: proposalsMessages.discardSummary(),
        action: (input) => proposalsMessages.discardAction(printable(input.positionals[0] ?? "")),
        options: { dir: dirOption },
        run: (input, context) => discardProposal(input, context, setup),
      },
    ],
    run: (input, context) => listProposals(input, context, setup),
  };
}

/** `halonic proposals`: what agents' runs propose to change, and accepting or discarding it. */
export const proposalsCommand: CliCommand = proposalsCommandWith(computerProposalsSetup);
