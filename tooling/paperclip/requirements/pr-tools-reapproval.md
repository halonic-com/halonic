# paperclip.pr-tools-reapproval

- Status: active
- Since: unreleased
- Source: HAL-16962; the rebase-only re-approval in HAL-14809 (board, 22 Nov); HAL-18167, the Merger's forms (HAL-15553); HAL-18190, the Merger's scope rule; HAL-18459, the re-approval on any pull request

When a reviewer's comment on a pull request reads "Julian: re-approved on head `<new>` (rebase only, range-diff vs `<old>`)", the Agent tools plugin's `pr_status` shall read it as Julian's signed approval of `<new>`, and outside Julian's limits `pr_status` shall count it only when Liam approved `<old>` and `julianRebaseRefusal` in `reviewer-paths.ts`: not a security pull request by its paths (`isSecurityPath`), not on a `changeset-release/` or `julian/` branch, as the Merger's gate does; otherwise its note shall say whether Liam approved `<old>` and why it needs Liam. A reviewer's "re-approved on head `<sha>`" or "approved again on head `<sha>`" line without the range-diff part shall be read like "approved on head `<sha>`", as the Merger reads it; it doesn't let Julian's approval count outside his limits.

## Examples

- Given #5676 touching `packages/host/server/src/cloud-sign-in-api.ts`, with "Liam: approved on head `0000000`" and "Julian: re-approved on head `7651f8c` (rebase only, range-diff vs `0000000`)" on current head `7651f8c`,
  when an agent asks `pr_status` about it,
  then Julian's re-approval doesn't count, and its note names `0000000` as the head Liam approved and says it is a security pull request by its paths, so it needs Liam.
- Given #4588 touching `pnpm-lock.yaml` with Liam's approval on `0000000` and the same re-approval,
  when an agent asks `pr_status` about it,
  then Julian's re-approval counts, with the note "rebase only since Liam's approval on 0000000 (HAL-18459)"; the same on `packages/x/src/sandbox/fence.ts` or on a `changeset-release/` branch doesn't.
- Given #4588 touching `pnpm-lock.yaml` with Liam's approval on `1111111` and the same re-approval,
  when an agent asks `pr_status` about it,
  then Julian's re-approval doesn't count, and its note says Liam didn't approve `0000000`.
- Given the same pull request with Liam's approval on `0000000` and "Julian: re-approved on head `7651f8c`" without the range-diff part,
  when an agent asks `pr_status` about it,
  then Julian's re-approval doesn't count, because it's outside his limits.
- Given #5908 with "Liam: re-approved on head `bb12791`" on current head `bb12791`,
  when an agent asks `pr_status` about it,
  then Liam's approval counts.
