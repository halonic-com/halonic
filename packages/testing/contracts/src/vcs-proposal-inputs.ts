/** Inputs the {@link Vcs} cases for proposal refs refuse or take. */

/** Where every proposal ref lives; nothing else is a ref the port takes. */
const proposals = "refs/halonic/proposals/";

/**
 * Refs `commitWorktreeTo`, `readRef` and `deleteRef` must refuse with a
 * `RangeError`: only `refs/halonic/proposals/<id>` is one, with `<id>` of
 * letters, digits, `-` and `_`, not starting with `-`. Git itself takes some
 * of these, such as `refs/halonic/proposals/-x`, and would move a branch or
 * HEAD for others, so the refusal is the port's own.
 */
export const invalidProposalRefs: readonly string[] = [
  "",
  "HEAD",
  "main",
  "refs/heads/main",
  "refs/halonic/proposal/x",
  "REFS/HALONIC/PROPOSALS/x",
  "/refs/halonic/proposals/x",
  "-x",
  "--force",
  proposals,
  `${proposals}-x`,
  `${proposals}--force`,
  `${proposals}../x`,
  `${proposals}..`,
  `${proposals}.`,
  `${proposals}a/b`,
  `${proposals}a/`,
  `/${proposals}a`,
  `${proposals}/a`,
  `${proposals}a.b`,
  `${proposals}a.lock`,
  `${proposals}a b`,
  `${proposals} a`,
  `${proposals}a\n`,
  `${proposals}a\u0000`,
  `${proposals}a@{1}`,
  `${proposals}a~1`,
  `${proposals}a^`,
  `${proposals}a:b`,
  `${proposals}a*`,
  `${proposals}\u00e9`,
];

/** Proposal refs that look odd but follow the rule; the port must take them. */
export const validProposalRefs: readonly string[] = [
  `${proposals}run-1`,
  `${proposals}R_2`,
  `${proposals}x-`,
  `${proposals}_x`,
  `${proposals}0`,
];
