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

import {
  FolderDefinitionStore,
  FolderRunCopies,
  FolderTrash,
  folderRecordLock,
} from "@halonicjs/adapter-fs-node";
import type { ProposalVcs } from "@halonicjs/app";
import type { RunProposalsParts } from "@halonicjs/host-harness-host";
import type { DefinitionStore, Digest } from "@halonicjs/ports";
import type { WorkspaceFolders } from "@halonicjs/profile";

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
    recordLock: folderRecordLock(folders.proposalRecordsFolder()),
    store,
    trash: new FolderTrash({ folder: folders.trashFolder(), store, digest }),
    onEndFailed: (_runId, error) => input.reportError(error),
  };
}
