// The public API of @halonicjs/auto-approvals. Everything else in src/ is internal.
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
