# Decision: the test filter also takes `contains`, the text `halonic test --filter` matches

- Approval: [HAL-4215](/HAL/issues/HAL-4215); the reviewer (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:n4Im9GIdf/ExZC8qI5fWiHnDmgYF5YdC+oxkXTYBE140WDWA8eUgBWmo0yVeg7TtlwOcGYs7x+0Z9CfIqiVQAw==
- Task: HAL-4215

## What changes

`test-runner.list-tests` said a filter keeps the cases whose hub, workflow and name each equal the
filter's, exactly, and that the CLI turns `--filter` into those parts. The exact parts stay as they
are. The filter gets one more part, `contains`: it keeps a case when the case's
`hub/workflow/name` contains that text, with the same case. A new example covers it, and the
sentence about the CLI now says the CLI passes `--filter` as `contains` and never matches cases
itself.

## Why

The CLI reference (HAL-1986, from Liam's HAL-2000 answers) says `halonic test --filter <text>`
"runs only the tests whose `hub/workflow/name` contains `<text>`: `--filter support/` runs every
test in the support hub", and the CLI output design (HAL-1981, 3.3) has `--filter refnd` matching
nothing. Exact parts can't say that: "support/" or a piece of a name isn't a hub, workflow or name.
The other way, the CLI listing every case and matching them itself, would put a loop over cases in
the command, which the thin-command rule keeps in the service. So the match lives in the runner,
next to the exact one, and `--list` and the run keep the same cases.

The case is kept, as written in the reference ("contains"). Nothing uses the filter yet, so no
caller changes.

## Covers

- test-runner.list-tests
