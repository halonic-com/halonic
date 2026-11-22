# Decision: two requirement wording gaps from the words check C648

- Task: HAL-15917 (words check C648, HAL-15907)
- Approval: team wording, no behaviour change (HAL-2282); Liam signs this note
- Kind: internal

## What changes

`cli.deploy-target-loader` now says what happens when the host name in `deployments.yaml` isn't lowercase letters and
digits with single hyphens: the run is refused before anything is imported, exit 2, with `"../x" isn't a deploy host.`
and the fix `Set host in deployments.yaml to cloudflare, then run again.` This is what the CLI already does.

`cli.profile-home`: the last example says "a full path" instead of "an absolute folder", as the rest of the file and
the CLI say.

No behaviour changes. No test was weakened, skipped or removed.

## Covers

- cli.deploy-target-loader
- cli.profile-home
