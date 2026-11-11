# Decision: open gives an open run's folder again, and Undo keeps a file with its decision

- Approval: the maintainer approves this change in review of HAL-5218
- Kind: internal

Two changes to the run proposal service; no test was weakened.

Opening a run that is already open now gives its folder again instead of
refusing, as the engine's `RunProposalFolders` port documents and as two
starts of the same run need. Opening a run that already has a proposal is
still refused. The example of `app.run-proposal-worktree` that said "it
refuses" now says it gives the same folder and adds none, and one example is
added for a run with a proposal.

Undo and Redo of a run proposal's step now write nothing of the step while
the run's decisions record is no longer as the step left it, and list every
entry under `changedOnDisk`. Before, the files came back while the decisions
record was held, so a file and its decision could disagree.
`app.run-proposal-accept` says so and gains one example.

## Covers

- app.run-proposal-accept
- app.run-proposal-worktree
