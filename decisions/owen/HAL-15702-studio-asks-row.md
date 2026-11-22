# Decision: Studio's asks row no longer says this version still asks first

- Approval: HAL-15702, from claims check C616 (HAL-15699); Liam's decision on the task, team wording on an approved screen (HAL-2282), for Liam's review
- Kind: user-visible

Studio's trust review says an agent with `asks: in-sandbox` "will edit and
run commands in its working folder, inside the sandbox; this version of
Halonic still asks first" (HAL-15401).

That clause is no longer true: since #4585 (HAL-15287) Studio's agent host
answers the agent's working-folder calls in a fenced run without a person
and logs each one as `harness.allowed` (`agent-host.sandboxed-asks`). Studio's
row drops the clause and now uses the same words as the CLI's row
(`cli.trust-check-asks`), which dropped it in HAL-15661.

The row still shows for the same agents, the Agents section still starts
open, and the Changed row's `Asks again` line is unchanged. The test only
changes the lines it quotes. `docs/security/trust.md`, the format README and
the changeset from HAL-15401 now say both the CLI and Studio answer the
calls.

## Covers

- studio.trust-review-asks
