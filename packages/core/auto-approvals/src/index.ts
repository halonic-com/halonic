// The public API of @halonicjs/auto-approvals. Everything else in src/ is internal.
export {
  type ActivityEntry,
  type ApprovalCard,
  type ApprovalComment,
  type ApprovalKind,
  type ApprovalRead,
  type ApprovalRecord,
  type CardRead,
  type LinkedIssue,
  type NoCardReason,
  type SourceRef,
  type Target,
  toCard,
  type UntypedReason,
} from "./card.ts";
export { normaliseClaim } from "./claims.ts";
export {
  type EffectiveNeverList,
  type EffectiveNeverListRead,
  effectiveNeverList,
  loosenDelayMs,
  type NeverListRevision,
  seedEntries,
} from "./effective-list.ts";
export { checkEligibility, type Eligibility, type NotEligibleReason } from "./eligibility.ts";
export { evaluateWriteAhead, Ledger, type LedgerOptions, type LedgerStore } from "./ledger.ts";
export {
  type ChainCheck,
  chainEntry,
  genesisHash,
  type LedgerEntry,
  type LedgerInput,
  type ShadowOutcome,
  verifyChain,
} from "./ledger-entry.ts";
export {
  type Hold,
  type NeverList,
  type NeverListEntry,
  type NeverListRead,
  type NeverListReason,
  neverListMaxLength,
  neverListVersion,
  readNeverList,
} from "./never-list.ts";
export {
  type ApprovalSource,
  type ApprovalType,
  approvalSources,
  approvalTypes,
  type EntryKind,
  entryKinds,
  isKnown,
  type PathClass,
  pathClasses,
  type TargetType,
  targetTypes,
} from "./vocabulary.ts";
