// Every value the never-list may name. A value outside these lists fails closed
// (design section 4, rule 1), so a typo like `hire_agnet` stops Studio instead of
// silently matching nothing. Adding a value here is a reviewed change.

/** Paperclip's board approval types. */
export const approvalTypes = [
  "hire_agent",
  "approve_ceo_strategy",
  "budget_override_required",
  "request_board_approval",
] as const;

/** Where an approval came from, as its payload's `source` says. */
export const approvalSources = ["tool_gateway"] as const;

/** What an approval is about. */
export const targetTypes = ["github_pr", "paperclip_issue_document", "none"] as const;

/** Classes of changed files, from the reviewer paths. */
export const pathClasses = ["security", "release", "liam", "core"] as const;

export type ApprovalType = (typeof approvalTypes)[number];
export type PathClass = (typeof pathClasses)[number];

/** The kinds of never-list entry, each with the values it may name. */
export const entryValues = {
  approval_type: approvalTypes,
  approval_source: approvalSources,
  target_type: targetTypes,
  path_class: pathClasses,
} as const;

/** A never-list entry kind with a fixed list of values. */
export type ListedKind = keyof typeof entryValues;

/** Every never-list entry kind: the listed ones, and `keyword`, which takes any text. */
export type EntryKind = ListedKind | "keyword";

/** Whether `value` is one of `list`. */
export function isOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (list as readonly string[]).includes(value);
}
