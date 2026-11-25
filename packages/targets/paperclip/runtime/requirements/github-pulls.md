# runtime.github-pulls

- Status: active
- Since: unreleased
- Source: HAL-18139, step 1b of the phase 3 plan on HAL-17450 (rev 5, "Generic actions, company settings"): the read handlers move from `tooling/paperclip` (`pr_status`, `my_prs`) into the runtime with the same answers, refusals and limits

When a tool runs `github.pull-request`, the runtime shall read the pull request the agent names, by number or GitHub URL, only on one of the tool's `repositories`, and answer its state, branch, task, author, `ci-ok` (the light run's while it's a draft), mergeability, commits behind its base, merge-queue state, signed approvals, changed lines, newest review finding and what the author does next, with GitHub's title and branch JSON-quoted as data; it shall count an approval only on the current head, from the repository's owner, members or collaborators, and not the author's own; when a tool runs `github.open-pull-requests`, the runtime shall list the open pull requests on the tool's `repositories` whose branch, in the repository itself, starts with the caller's `urlKey`, the conflicting or red ones first, and name a repository after the first that the token can't reach instead of failing; and both actions shall read GitHub only through the runtime's GET reader.

## Examples

- Given `pr_status` on `acme/website` and an agent asking for `#12` on `acme/other`,
  when it runs,
  then it answers that the repo must be one of `acme/website` and sends no request.
- Given `#12` on `priya/ACME-7-checkout` with "Liam: approved on head `0000000`" and "Julian: approved on head `7651f8c`" on head `7651f8c…`,
  when Mateo calls `pr_status` for 12,
  then Liam's approval doesn't count (an older head), Julian's does, and the task is `ACME-7`.
- Given a fork's branch named `priya/ACME-7-x`,
  when an agent reads that pull request,
  then it names no author and no task.
- Given Mateo with one green and one conflicting pull request and a fork's branch named `mateo/…`,
  when Mateo calls `my_prs`,
  then it lists the two, the conflicting one first as "NEEDS YOU", and not the fork's.
