# check.decision-sign-release-base

- Status: active
- Since: unreleased
- Source: HAL-17599

When an approver runs `pnpm decision sign <pull request number>` for a pull request into `main` or a release branch (`release/<name>`), the tool shall sign the note against that base branch's `approvers.json` and notes, and it shall refuse a pull request into any other branch.

## Examples

- Given a pull request into `release/halonic-0.1.1` with an unsigned `internal` note,
  when the security reviewer signs it,
  then the tool prints the text and a `- Signature:` line.
- Given a pull request into `develop`,
  when an approver signs it,
  then the tool refuses and says it signs only for `main` or a release branch.
