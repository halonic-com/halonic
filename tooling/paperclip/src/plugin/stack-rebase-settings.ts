/**
 * The stack rebase's settings (HAL-18031, Julian's OK on HAL-18035), split
 * from `manifest.ts` to keep it under the size limit.
 */
export const stackRebaseConfigProperties = {
  // The merge-control ADR's branch credential, kept apart from the read token. Read only by
  // src/plugin/stack-rebase-job.ts, at each rebase, inside the branch write client. Declared a
  // string: the host checks the field with the secret binding swapped for its id.
  branchUpdateToken: {
    type: "string",
    title: "Branch update token",
    description:
      "The secret with the branch credential (a GitHub App the board creates, Contents write on halonic-com/halonic only, no bypass of the main ruleset). Used only for GitHub's rebase of a stacked pull request's branch on main, after the pull request below it merged.",
    format: "secret-ref",
  },
  stackRebase: {
    type: "boolean",
    title: "Rebase stacked pull requests",
    description:
      "When the pull request below a stacked one merges, ask GitHub once per head to rebase the stacked one on main instead of waking its author (HAL-18031). Needs the branch update token. Off until the board turns it on.",
    default: false,
  },
} as const;
