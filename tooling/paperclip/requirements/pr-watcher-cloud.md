# paperclip.pr-watcher-cloud

- Status: active
- Since: unreleased
- Source: HAL-17730; the board's ask on HAL-10 (24 Nov) after an approval of cloud#103 went unnoticed, which kept HAL-16864 and the tasks behind it blocked

When the Agent tools plugin watches `halonic-com/cloud`, whose `main` rule asks for an approving GitHub review by an account other than the agents' shared one, the PR watcher shall count such a standing review on a pull request's head as its approval, shall comment on the task and ask Paperclip to wake its author once per head to merge it, shall mark the task done once it merged with `ci-ok` green as on `halonic`, shall keep and show no title of a private repository's pull request (Julian's condition for the token, HAL-17743), and shall leave out of a pass, with a logged error, a watched repository after the first that its token doesn't reach.

## Examples

- Given cloud pull request 103 on `mateo/HAL-103-owner-actions`, out of draft, with an approving GitHub review on its head by a member of the organization,
  when the watcher runs twice,
  then it wakes Mateo once to merge it and doesn't hand the task to a reviewer.
- Given the same review on `halonic`,
  when the watcher runs,
  then it doesn't count it: there only signed approvals count.
- Given an approving review by the agents' shared account, by someone outside the organization, or one dismissed or followed by a request for changes from the same account,
  when the snapshot is taken,
  then it records no GitHub approval for it.
- Given a cloud pull request pushed to after the approving review,
  when the watcher runs,
  then it doesn't wake the author to merge, and warns once that the push voided the approval.
- Given cloud pull request 102, merged with a green `ci-ok` on its merge commit,
  when the watcher runs,
  then it marks the task done.
- Given a token that reaches `halonic` but not `cloud`,
  when the watcher takes its snapshot,
  then it reads `halonic`, leaves `cloud` out and logs why; when the token doesn't reach `halonic`, the pass fails.
- Given a private repository's pull request titled "feat: acme private plan",
  when the snapshot is taken or `pr_status` describes it,
  then the snapshot keeps no title and the tool prints "title not shown (private repository)".
- Given no `repos` setting,
  when the plugin reads its settings,
  then it watches `halonic-com/halonic` and `halonic-com/cloud`, in that order.
