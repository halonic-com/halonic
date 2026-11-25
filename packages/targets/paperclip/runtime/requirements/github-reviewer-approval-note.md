# runtime.github-reviewer-approval-note

- Status: active
- Since: unreleased
- Source: HAL-18720, the second comparison on HAL-17968: Agent tools' `pr_status` notes that Julian's approval holds unless the pull request is security or release, and the generic one dropped it

When a `github.pull-request` tool's path rules pick their `default` role for a pull request and the snapshot's routing names the agent who covers it, the runtime shall add the note "unless it's a security or release pull request" to each approval on the current head that counts and that this agent signed, by its url key, its display name or the display name's first word in any case; it shall leave every other approval as it is, and add no note when the paths pick the `escalateTo` role, when no agent covers the role or when the repository has no path rules.

## Examples

- Given rules with `default: second-reviewer` and a routing where Mateo covers it,
  when Mateo approves the head of a pull request that changes only `src/cart.ts`,
  then the approval counts, with the note "unless it's a security or release pull request".
- Given the same rules and routing,
  when Mateo approves the head of a pull request that changes `infra/deploy.ts`,
  then the approval carries no note.
- Given the same rules and a routing where no one covers `second-reviewer`,
  when an agent approves the head,
  then the approval carries no note.
