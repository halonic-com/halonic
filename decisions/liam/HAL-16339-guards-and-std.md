# Decision: a working folder can't be in `integrations/`, and starts are split at commas and brackets too

- Approval: Liam decided this on HAL-16339 as owner of the shared core; Julian signs because Liam wrote the pull request
- Kind: user-visible
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:l0nBq+NxHv1Av29Q12qK8Ga8Zmfp9UnKJm50itOVA7X0VPXLGtBGoKon1HxkkfP4gihFflXhkKxoxaGw2ElADQ==

## What changes

- `format.agent-sandbox-fields`: a harness agent's `workingFolder` also fails when its first part is
  `integrations`, the folder that holds the local integrations' code. One example is added.
- `format.program-start-paths`: an argument or `env` value is also split at `=`, `:`, `;`, `@`,
  spaces, `,` and the brackets `[`, `]`, `(`, `)`, `{` and `}`. One example is added. Every path
  read before is still read.

## Why

The runner runs a local integration's code outside the sandbox, with the integration's secrets, so
an agent that writes inside the sandbox must not be able to write there; the other folders of that
kind (`hubs`, `library`, the kinds' folders) were already refused. The guards that read a start
for paths read more pieces now, which only makes them stricter, as the requirement's own reasoning
says: a path in a comma list or in brackets is still a path the program can load.

## Covers

- format.agent-sandbox-fields
- format.program-start-paths
