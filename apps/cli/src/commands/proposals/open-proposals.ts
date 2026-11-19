// What every `halonic proposals` command opens: the workspace the person
// pointed at, its name for the lines, and its run proposals, closed again
// when the command is done.

import type { GitRunnerOptions } from "@halonicjs/adapter-git";
import { ProposalUnavailableError, type RunProposals } from "@halonicjs/app";
import type { ProfileEnvironment } from "@halonicjs/profile";
import { loadWorkspace } from "@halonicjs/workspace";
import { type CommandContext, type CommandInput, OwnLineError } from "../../command.ts";
import { openLocalProposals } from "../../local-proposals.ts";
import { proposalsMessages } from "../../messages/proposals.ts";
import { printable } from "../../output/printable.ts";
import type { RunClock } from "../../run-times.ts";
import { givenDir, openWorkspaceDir } from "../../workspace-dir.ts";
import { workspaceNameOf } from "../../workspace-trust.ts";
import type { ProposalPlace } from "./find-proposal.ts";

/** What `halonic proposals` reads besides the command line, passed in so tests can fix it. */
export interface ProposalsSetup {
  /** The clock and time zone the list's times are written in. */
  clock(): RunClock;
  /** Where the profile folder is, which holds the proposals; this process's by default. */
  readonly profile?: ProfileEnvironment;
  /** Which git reads a proposal made with history on; the one on the `PATH` by default. */
  readonly git?: GitRunnerOptions;
}

/** The workspace's proposals and where the person typed the command. */
export interface OpenedProposals {
  readonly proposals: RunProposals;
  readonly place: ProposalPlace;
}

/**
 * Opens the workspace's proposals, hands them to `work`, and closes them,
 * whatever `work` did.
 *
 * @throws NoWorkspaceError when the folder holds no workspace
 */
export async function withProposals<T>(
  input: CommandInput,
  context: CommandContext,
  setup: ProposalsSetup,
  work: (opened: OpenedProposals) => Promise<T>,
): Promise<T> {
  const workspace = await openWorkspaceDir(input, context);
  const loaded = await loadWorkspace(workspace.store);
  // The workspace's name is outside text (cli-output section 5).
  const place = {
    workspaceName: printable(workspaceNameOf(loaded, workspace)),
    dir: givenDir(input, workspace),
  };
  const { proposals, close } = await openLocalProposals(workspace.root, {
    ...(setup.profile === undefined ? {} : { profile: setup.profile }),
    ...(setup.git === undefined ? {} : { git: setup.git }),
  });
  try {
    return await work({ proposals, place });
  } finally {
    await close();
  }
}

/**
 * What `read` gives, or an `unavailable` error that says so when the
 * proposal's texts were deleted outside Halonic.
 *
 * @throws OwnLineError `unavailable` for a `ProposalUnavailableError`
 */
export async function unlessUnavailable<T>(read: () => Promise<T>, shownRunId: string): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (!(error instanceof ProposalUnavailableError)) throw error;
    throw new OwnLineError("unavailable", proposalsMessages.unavailable(shownRunId));
  }
}
