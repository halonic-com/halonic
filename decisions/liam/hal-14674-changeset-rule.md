# Decision: the PR template asks for a changeset now that 0.1.0 has shipped

- Approval: Liam decided it on HAL-14674 as the weekly working-rules update; Julian reviews and signs it there
- Kind: internal
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:uCD/XZfmuT03H0FuSBb6f+9BDVdtnHibx3mGmQFEYoxaqI2tt8k9IJSKPQ2Bs1TxNUocqJ62HZEER1IMikFFCw==

`.github/pull_request_template.md` no longer says "Don't run `pnpm changeset` before the
0.1.0 release". Its Changeset section now asks for a `.changeset/*.md` that names
`@halonicjs/app-studio` (the CLI included) when a change is one users will notice, and
"None (no user-visible change)" otherwise. `CONTRIBUTING.md` and the root `AGENTS.md` say
the same. Only wording changes; no workflow, check or trust root is touched.

## Why

0.1.0 has shipped, and `.changeset/README.md` already asks for changesets. The template and
`CONTRIBUTING.md` still told contributors not to write one, so pull requests with changes
users notice kept landing without a changelog line.

## Covers

- .github/
