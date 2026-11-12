# Decision: the CLI names the workspace from workspace.yaml

- Approval: Liam decided this on [HAL-6610](/HAL/issues/HAL-6610) (from the CLI output read, HAL-5959), small wording on approved CLI output, a team decision with no board card (HAL-2282 rule); Tomas reviewed it on HAL-6693; the package owner (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:aJ7QY+4sJ9nRcCNJW3n00AYScwCLsmhkytOH94Ixm8i1lwpcbmPhcbYySy5tQGi3piaZvyLj9cogTns93BDGAg==
- Task: HAL-6610

## What changes

`halonic run`, `halonic runs` (list, show and the heading of `runs send`) and `halonic routines`
(list, watch) name the workspace by its `name` in `workspace.yaml`, as `halonic doctor` and the
trust line already do. In the Acme example a run's heading reads "Running Support reply in Acme ·
run 01jd8q" instead of "… in acme …", and an empty filtered list reads "No failed runs of
support-reply in Acme." (`cli.messages`, goldens `run/golden/support-reply-approved.txt` and
`run/golden/support-reply-waiting.txt`).

The action labels ("Couldn't list the runs in acme:") keep the folder name, because they are made
before the workspace loads. A workspace without a name in `workspace.yaml` still shows the folder
as typed, as `doctor` does.

## Why

The same workspace was called "Acme" by `doctor` and the trust line and "acme" by `run` and
`runs`, so one session's output named it two ways. The name in `workspace.yaml` is the one the user
chose; the folder is only where it lives.

## Covers

- cli.messages
- apps/cli/src/commands/run/golden/support-reply-approved.txt
- apps/cli/src/commands/run/golden/support-reply-waiting.txt
