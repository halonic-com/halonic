# runtime.github-reviewer-rules

- Status: active
- Since: unreleased
- Source: HAL-18292, PR 1 of HAL-18289 (Liam's review of the proposal): the generic `pr_status` names the reviewer by the company's path rules, as Agent tools' `pr_status` does; HAL-19256: line limits count each file's lines, and folder limits, as halonic's `overLineLimit` does

When a `github.pull-request` tool gives `reviewerRules` for the pull request's repository, the runtime shall match every changed path (both sides of a rename) and the changed lines against those rules, answer the rules' `escalateTo` role when a path is one of `files`, starts with one of `folders`, is a `package.json` below the root while `nestedPackageJson` is on, or holds one of `words` in any case without matching a `wordsSkip` regex, or when the changed lines of the paths matching no `lineLimit.skip` regex exceed `lineLimit.max`, or those of them under one of a folder limit's `folders` exceed that limit's `max` (counting each file's additions plus deletions once, under a renamed file's new path and none under its old one, and the whole pull request's lines when a path's own count is unknown), and the rules' `default` role otherwise; it shall name the agent the snapshot's routing gives that role, say that the answer is by paths only and that security or release PRs and the author's own PRs route differently, read the changed files only when the repository has rules, and answer that there are no path rules for a repository without them. Which tool files may hold rules: `format.tool-reviewer-rules`.

## Examples

- Given rules for `acme/website` with `folders: [infra/]`, `default: second-reviewer`, `escalateTo: code-reviewer`, and a routing where Priya covers `code-reviewer`,
  when an agent reads a pull request that renames `infra/deploy.ts` to `scripts/deploy.ts`,
  then the reviewer is `priya as code-reviewer`, by paths.
- Given rules with `words: [secret]` and `wordsSkip: ['\.md$']`,
  when a pull request changes only `docs/secret-handling.md`,
  then the reviewer is the `second-reviewer`.
- Given rules with `lineLimit: { max: 1200, skip: ['\.test\.ts$'] }`,
  when a pull request changes 1,500 lines, all in `src/cart.test.ts`,
  then the line limit doesn't escalate it.
- Given rules with `lineLimit: { max: 1200, skip: ['\.test\.ts$'] }`,
  when a pull request changes 700 lines in `src/cart.ts` and 900 in `src/cart.test.ts`,
  then the line limit doesn't escalate it: only the 700 count.
- Given rules with `lineLimit: { max: 1500, folderLimits: [{ folders: [src/kernel/], max: 800 }] }`,
  when a pull request changes 801 lines in `src/kernel/step.ts`,
  then the reviewer is the `escalateTo` role.
- Given rules with `lineLimit: { max: 1500, folderLimits: [{ folders: [src/kernel/], max: 800 }] }`,
  when a pull request renames `src/kernel/run.ts` to `src/kernel/step.ts` and changes 700 lines in it,
  then the line limits count 700 lines, not 1,400, and don't escalate it.
- Given a tool reading `acme/website` with no `reviewerRules`,
  when an agent reads a pull request,
  then the answer says there are no path rules for this repository and the files aren't read.
