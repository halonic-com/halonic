# paperclip.pr-tools-reapproval

- Status: active
- Since: unreleased
- Source: HAL-16962; the rebase-only re-approval in HAL-14809 (board, 22 Nov)

When a reviewer's comment on a pull request reads "Julian: re-approved on head `<new>` (rebase only, range-diff vs `<old>`)", the Agent tools plugin's `pr_status` and `my_prs` shall read it as Julian's signed approval of `<new>`, and outside Julian's limits `pr_status` shall count it only if Liam's signed approval of `<old>` is on the pull request; a "re-approved on head" line without the range-diff part shall not be a signed approval.

## Examples

- Given #4588 touching `pnpm-lock.yaml`, with "Liam: approved on head `0000000`" and "Julian: re-approved on head `7651f8c` (rebase only, range-diff vs `0000000`)" on current head `7651f8c`,
  when an agent asks `pr_status` about it,
  then Julian's re-approval counts and names `0000000` as the head Liam approved.
- Given the same pull request with Liam's approval on `1111111` instead,
  when an agent asks `pr_status` about it,
  then Julian's re-approval doesn't count, because Liam didn't approve `0000000`.
- Given a comment "Julian: re-approved on head `7651f8c`" without the range-diff part,
  when the plugin reads the signed approvals,
  then it finds none.
