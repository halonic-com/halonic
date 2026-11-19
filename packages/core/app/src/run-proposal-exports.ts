// The run proposal part of the public API of @halonicjs/app: folders, records,
// settling, types and service. `index.ts` re-exports all of it.

export {
  type ProposalFolderRun,
  ProposalFolders,
  type ProposalFoldersOptions,
} from "./run-proposal-folders.ts";
export type { PartlyDecided, ProposedRecord, Settled } from "./run-proposal-record.ts";
export { isProposalFinished, type SettleResult } from "./run-proposal-settle.ts";
export {
  type AcceptResult,
  type CompareTexts,
  type Decision,
  type FileBase,
  type HistoryOffProposal,
  type HistoryOnProposal,
  type InFileProposalTarget,
  type InFileResult,
  type ProposalFileParts,
  type ProposalTarget,
  ProposalUnavailableError,
  type ProposedFile,
  type RefusalReason,
  type RejectResult,
  type RunProposal,
  type UndoFileWrite,
  type UndoSource,
  type UndoStep,
  WorkspaceTooBigToCopyError,
} from "./run-proposal-types.ts";
export {
  type ProposalVcs,
  type RunCopies,
  RunProposals,
  type RunProposalsOptions,
  type RunWorktree,
} from "./run-proposals.ts";
