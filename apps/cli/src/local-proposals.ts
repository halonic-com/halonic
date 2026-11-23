// The run proposals of one workspace on this computer (HAL-6477): the parts
// the engine's harness host keeps them with, and the service
// `halonic proposals` lists, shows and decides them with. Both are built
// from the same folders in the profile, so the command reads what the
// engine's runs left and writes the same workspace files Accept would in
// Studio.
//
// The command opens no engine and takes no engine lock: a proposal belongs
// to a run that has ended, and Accept writes each file only while it is
// still the run's base, so a newer edit is never overwritten. It works while
// `halonic routines watch` runs. The engine and the command still open the
// same records, so every read and write of a record holds that run's record
// lock (`folderRecordLock`), in the engine as in the command.

import { realpath } from "node:fs/promises";
import { type GitRunnerOptions, lazyGitVcs } from "@halonicjs/adapter-git";
import type { RunProposals } from "@halonicjs/app";
import { runProposalsOf } from "@halonicjs/host-harness-host";
import type { Clock } from "@halonicjs/ports";
import { type ProfileEnvironment, profileFolder, workspaceFolders } from "@halonicjs/profile";
import { systemClock } from "@halonicjs/std";
import { localProposalParts } from "@halonicjs/target-node-harness";
import { nodeProfileEnvironment, webCryptoDigest } from "./workspace-runs.ts";
import { workspaceStore } from "./workspace-store.ts";

/** What {@link openLocalProposals} opens the service with; this computer's by default. */
export interface LocalProposalsOptions {
  /** Where the profile folder is; this process's by default. */
  readonly profile?: ProfileEnvironment;
  /** Which git reads a proposal made with history on; the one on the `PATH` by default. */
  readonly git?: GitRunnerOptions;
  readonly clock?: Clock;
}

/** The workspace's run proposals, open until {@link LocalProposals.close}. */
export interface LocalProposals {
  readonly proposals: RunProposals;
  /** Stops git, if it started. Safe to call twice. */
  close(): Promise<void>;
}

/**
 * Opens the run proposals of the workspace in `workspaceRoot`. Git starts
 * only when a proposal made with history on is read.
 *
 * @throws when the workspace folder doesn't exist, or `HALONIC_HOME` or the
 *   home folder isn't an absolute folder
 *
 * @example
 * const { proposals, close } = await openLocalProposals(workspace.root);
 * try { await proposals.list(); } finally { await close(); }
 */
export async function openLocalProposals(
  workspaceRoot: string,
  options: LocalProposalsOptions = {},
): Promise<LocalProposals> {
  const location = await realpath(workspaceRoot);
  const profile = profileFolder(options.profile ?? nodeProfileEnvironment());
  const folders = await workspaceFolders(profile, location, webCryptoDigest);
  const git = lazyGitVcs({
    location,
    worktrees: folders.proposalWorktreesFolder(),
    ...(options.git === undefined ? {} : { git: options.git }),
  });
  const parts = localProposalParts({
    folders,
    // Accept and Undo never write the profile, even when the workspace holds it (HAL-15201).
    store: workspaceStore(location, location, profile),
    digest: webCryptoDigest,
    vcs: git.vcs,
    // Only a run's end reports here, and the command ends no run.
    reportError: () => {},
  });
  const proposals = runProposalsOf(parts, webCryptoDigest, options.clock ?? systemClock);
  return { proposals, close: git.close };
}
