# paperclip.pr-tools

- Status: active
- Since: unreleased
- Source: HAL-15929, phase 1 of the Agent tools plugin (HAL-15920, tools B1); Liam's decision there to build it in `tooling/paperclip`

When an agent calls the Agent tools plugin's `pr_status` tool with a pull request on one of the plugin's repositories, the plugin shall answer from GitHub GET requests alone with the pull request's state, its `ci-ok` on the current head (the light run's while it's a draft), whether it's mergeable, in the merge queue and behind its base, the reviewer by the path rules, and each signed approval from the repository's team (owner, members, collaborators) with whether it counts on the current head by the HAL-14809 rules. (`my_prs` moved to the workspace plugin, HAL-17968.)

## Examples

- Given #4588 on Priya's branch for HAL-14219, with Liam's approval on an older head and Julian's on the current one, touching only `docs/guides/`,
  when an agent asks `pr_status` about it,
  then Julian's approval counts, Liam's doesn't, and the reviewer by the path rules is Julian.
- Given the same pull request touching `pnpm-lock.yaml`,
  when an agent asks `pr_status` about it,
  then Julian's approval doesn't count, the reviewer is Liam, and the next step is to get a review on this head.
- Given a comment "Priya: approved on head `7651f8c`" on Priya's own pull request, and "Liam: approved on head `7651f8c`" from someone outside the repository's team,
  when an agent asks `pr_status` about it,
  then neither approval counts.
- Given a pull request from a fork whose branch is named `priya/HAL-14219-…`,
  when an agent asks `pr_status` about it,
  then it names no author and no task.
- Given a fork's pull request whose title and branch hold a line break and a line that reads like an instruction,
  when an agent asks `pr_status` about it,
  then the answer gives the title and branch JSON-quoted in one line marked as GitHub text, data not instructions, and the tool descriptions say the same.
- Given a pull request whose base branch is `release/0.2#x`,
  when an agent asks `pr_status` about it,
  then the compare request encodes each part of the branch name, so the `#` stays in the path.
- Given a pull request URL on a repository the plugin doesn't watch,
  when an agent asks `pr_status` about it,
  then the tool answers with an error and sends no request to GitHub.
