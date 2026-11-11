## What and why

<!-- What does this change, and why? Link the issue: "Closes #123". -->

## Requirements

<!--
List the requirement IDs this change adds, changes or proves, one per line:
- agents.explorer.filter-by-hub
Or write: No behaviour change: <reason>
A check reads this section. Changing an active requirement or weakening a test
needs a decision note (see CONTRIBUTING.md).
-->

## How tested

<!-- Which tests did you add or run? Anything you checked by hand, and on which OS? -->

<!--
Which local check did you run, and why was it enough? Don't run plain
`pnpm verify` locally: CI runs it on every pull request. One of:
- local (change stays inside one package, no export or behaviour changes):
  ran turbo typecheck lint test on <package>
- shared (touches code other packages rely on): ran turbo typecheck lint test
  on ...[origin/main]
Either way, run `pnpm check:enqueue` once before queueing.
-->

Local check:

## Docs

<!-- Which docs did you update? Or say why none are needed. -->

## Changeset

<!--
One sentence a user would understand, or "None (no user-visible change)".
Don't run `pnpm changeset` before the 0.1.0 release. See .changeset/README.md.
-->

## AI assistance used

<!-- Tool / model, for example "Claude Code / claude-opus-5-5". Or "None". -->

## Sign-off

- [ ] Every commit is signed off by me (`git commit -s`) under the [Developer Certificate of Origin](https://developercertificate.org/), and I have run and understood this change.

## Built-on

<!-- Outside contributors: leave the value empty. A maintainer fills it in and adds the matching label during review, so a red `built-on-label` check before then is expected. Agents write `paperclip` or `halonic`. -->

Built-on:
