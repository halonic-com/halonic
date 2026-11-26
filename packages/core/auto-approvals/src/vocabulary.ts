// The known values a never-list entry and an approval card may name. A value
// outside these lists fails closed: the never-list stops Studio, and a card
// becomes not eligible. Adding a value here is a reviewed change.

/** Paperclip's board approval types that Studio knows. */
export const approvalTypes = [
  "hire_agent",
  "approve_ceo_strategy",
  "budget_override_required",
  "request_board_approval",
] as const;

/** One of {@link approvalTypes}. */
export type ApprovalType = (typeof approvalTypes)[number];

/**
 * The `payload.source` values Studio knows. `tool_gateway` is the board's key
 * for running a stored high-risk tool call, so it is never eligible.
 */
export const approvalSources = ["tool_gateway"] as const;

/** One of {@link approvalSources}. */
export type ApprovalSource = (typeof approvalSources)[number];

/** What an approval can point at. */
export const targetTypes = ["github_pr", "paperclip_issue_document", "none"] as const;

/** One of {@link targetTypes}. */
export type TargetType = (typeof targetTypes)[number];

/**
 * Classes of the files a pull request changes, from `reviewerFor` on the
 * files at the pinned head. Every class but `ordinary` blocks.
 */
export const pathClasses = [
  "security",
  "liam_path",
  "release",
  "version_bump",
  "ordinary",
] as const;

/** One of {@link pathClasses}. */
export type PathClass = (typeof pathClasses)[number];

/** The kinds of entry a never-list may hold. */
export const entryKinds = [
  "approval_type",
  "approval_source",
  "target_type",
  "path_class",
  "keyword",
] as const;

/** One of {@link entryKinds}. */
export type EntryKind = (typeof entryKinds)[number];

/** Whether `value` is one of `known`, narrowed to that list's type. */
export function isKnown<T extends string>(known: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (known as readonly string[]).includes(value);
}
