// The public API of @halonicjs/auto-approvals. Everything else in src/ is internal.
export type {
  ActivityEntry,
  ApprovalComment,
  ApprovalRead,
  ApprovalRecord,
  LinkedIssue,
} from "./approval-read.ts";
export {
  type ApprovalCard,
  type ApprovalKind,
  type CardClaims,
  type CardRead,
  type Requester,
  type SourceRef,
  type Target,
  toCard,
  type UntypedReason,
} from "./card.ts";
export { findKeywords, normaliseForKeywords } from "./keyword.ts";
export {
  type ApprovalType,
  approvalSources,
  approvalTypes,
  type EntryKind,
  type PathClass,
  pathClasses,
  targetTypes,
} from "./known-values.ts";
export { effectiveNeverList, loosenDelayMs, type NeverListRevision } from "./loosen.ts";
export {
  type Hold,
  type NeverList,
  type NeverListEntry,
  type NeverListRead,
  type NeverListReason,
  neverListVersion,
  readNeverList,
  seedEntries,
  withSeedFloor,
} from "./never-list.ts";
export { type BlockReason, type Screening, screenCard } from "./screen.ts";
