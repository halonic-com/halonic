# Decision: a step line names the model alias the agent runs on, the default one too

- Approval: the words check on [HAL-4355](/HAL/issues/HAL-4355) (#1370) asked for this on [HAL-4391](/HAL/issues/HAL-4391); the package owner (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:Jbnkoako7P8T8U8CXG8WZldCUCs88LOyreDIl9WNvp0OQcw6CsxUHTvhSkntKRbGOA3+x+fzPex2j37nBleLCQ==
- Task: HAL-4391

## What changes

cli-output 3.4 says an agent step's live ◌ line shows the agent and its model:
`◌ Draft a reply    Writer · smart · waiting for Anthropic (12 s)`. The step lines already named
the alias when the step's method or agent sets one, but an agent without its own model showed
only its name, though it runs on the hub's or the workspace's default alias. Now the line names
that default alias too, the same one the CLI's model resolver picks. With no alias at all the
segment is left out, so there is never an empty `·`.

The live line and the ✓ line share this, so they keep saying the same (`cli.print-ahead`). In the
Acme example every agent runs on the workspace default, so both golden files and `halonic runs show`
(and its requirement's examples) now say it:

```text
before:  ✓ Read the email        Writer   1 s
after:   ✓ Read the email        Writer · default   1 s
```

`cli.run-live` now says what the live line names, its example reads as 3.4 does, and "An end state
is no step" reads "An end of the workflow is not a step and shall not count." (glossary, cli-output
1.1). No example was removed or weakened; the live-line test runs the Writer on a `smart` alias, and
a new unit test covers the default alias and the case without one.

## Why

The approved words win over the code, and the alias tells the user which model a wait is on. This
is wording on a screen the board already approved, which the team decides (board, HAL-2282).

## Covers

- cli.run-live
- cli.commands.runs.show
- apps/cli/src/commands/run/golden/support-reply-waiting.txt
- apps/cli/src/commands/run/golden/support-reply-approved.txt
