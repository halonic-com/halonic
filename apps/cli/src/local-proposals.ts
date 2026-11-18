// The run proposals of one workspace on this computer (HAL-6477): the parts
// the engine's harness host keeps them with, and the service
// `halonic proposals` lists, shows and decides them with. Both are built
// from the same folders in the profile, so the command reads what the
// engine's runs left and writes the same workspace files Accept would in
// Studio.
//
// The command opens no engine and takes no engine lock: a proposal belongs
// to a run that has ended, which no engine touches again, and Accept writes
// each file only while it is still the run's base, so a newer edit is never
// overwritten. It works while `halonic routines watch` runs.

import { realpath } from "node:fs/promises";
import { FolderDefinitionStore, FolderRunCopies, FolderTrash } from "@halonicjs/adapter-fs-node";
import { type GitRunnerOptions, lazyGitVcs } from "@halonicjs/adapter-git";
import type { ProposalVcs, RunProposals } from "@halonicjs/app";
import { type RunProposalsParts, runProposalsOf } from "@halonicjs/host-harness-host";
import type { Clock, DefinitionStore, Digest } from "@halonicjs/ports";
import {
  type ProfileEnvironment,
  profileFolder,
  type WorkspaceFolders,
  workspaceFolders,
} from "@halonicjs/profile";
import { systemClock } from "@halonicjs/std";
import { nodeProfileEnvironment, webCryptoDigest } from "./workspace-runs.ts";

/** What the proposal parts are built from. */
export interface LocalProposalPartsInput {
  /** The workspace's folders in the profile, where the records, copies and trash are. */
  readonly folders: WorkspaceFolders;
  /** The workspace's files, which Accept writes. */
  readonly store: DefinitionStore;
  readonly digest: Digest;
  /** Git with its worktrees in the profile; a proposal made with history on reads its texts from it. */
  readonly vcs: ProposalVcs;
  /** Hears the error of a folder's end that couldn't finish. */
  reportError(error: unknown): void;
}

/**
 * The parts of the workspace's run proposal service: git, a plain copy of
 * the saved files for a run with history off, the records and the trash, all
 * in the workspace's folders in the profile, never in the workspace.
 */
export function localProposalParts(input: LocalProposalPartsInput): RunProposalsParts {
  const { folders, store, digest } = input;
  return {
    vcs: input.vcs,
    // With history off, a run that writes files works in a plain copy of the saved files.
    copies: new FolderRunCopies(folders.runCopiesFolder()),
    records: new FolderDefinitionStore(folders.proposalRecordsFolder()),
    store,
    trash: new FolderTrash({ folder: folders.trashFolder(), store, digest }),
    onEndFailed: (_runId, error) => input.reportError(error),
  };
}

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
    store: new FolderDefinitionStore(location),
    digest: webCryptoDigest,
    vcs: git.vcs,
    // Only a run's end reports here, and the command ends no run.
    reportError: () => {},
  });
  const proposals = runProposalsOf(parts, webCryptoDigest, options.clock ?? systemClock);
  return { proposals, close: git.close };
}
