# Decision: a busy provider's own lines, and the alias doc, after the review of #1155

- Requirement: `cli.run-failure` (`apps/cli/requirements/run-failure.md`)
- Task: HAL-3814; the review of #1155 on HAL-3841, and #1156 (HAL-2184)
- Approval: the maintainer approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:PvnhcRgpIpIMG+whoOgxmM7C0hrkhwsvaqP2NcEfD9p8ohIBPmVZvXUaYcAsFBwWcG+OeD8n2W2XlmrznQzcBQ==

## What changes

`cli.run-failure` said a run that failed with `provider-busy` gets the general lines, because the
lines named how often and how long Halonic tried, and the run log doesn't hold that. Since #1156
(cli-output 3.4, revision 39) the busy line names the tries only when the engine retried, so the
mapping now gives `provider-busy` its own lines with the provider of the model the run called last.
Without a model it still gets the general lines, as every model reason does.

The requirement gets one sentence for this. Its `provider-busy` example now names the busy line,
and a new example keeps `budget` on the general lines, which still need the budget and the spend.
The source line names the review and revision 39.

Two smaller changes from the review need no requirement change: a skipped model counts as
missing its key only when the skip's reason is `no-key` (today the only reason), and the doc of
`WorkspaceModels.aliases` says to pass the run's hub's aliases.

## Tests

No test was removed or loosened. `provider-busy` moves from the list of reasons with the general
lines to its own test, which also checks line 2, and joins the list of model reasons that get the
general lines when the run called no model. `budget` stays on the general list.

## Covers

- cli.run-failure
