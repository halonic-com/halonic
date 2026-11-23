# deploy.record

- Status: active
- Since: unreleased
- Source: HAL-6702; the `deployTarget` design (section 3, step 6) on HAL-6702; deploy flow C4 (HAL-6687)

After a deploy has uploaded a version and it serves, the target shall keep that version's record in the deployment's definitions bucket, under the version's id: the snapshot's full commit, its Halonic version and every address it reaches, each with the secret it sends there. A record that can't be written shall not fail a deploy whose version serves. `plan`, `status` and `rollback` shall read the commit and the Halonic version of a version from its record; a version without a record, or with one that doesn't fit this shape, shall count as having none, so its Halonic version and what it reaches are unknown.

Rationale: Cloudflare keeps only 100 characters of a version's note, already used by the commit and the bundle hash, so the Halonic version and the reaches need a place of their own; keyed by version, a rollback finds the record of the version it brings back.

## Examples

- Given a deploy of commit `0123…` on Halonic 0.2.0 that reaches `api.anthropic.com` with `ANTHROPIC_API_KEY`, when its version `v1` serves, then `deploys/v1.json` in `acme-defs` holds that commit, version and reach.
- Given the record write is refused, when the deploy's version serves, then the deploy still ends as deployed.
- Given version B serves with a record of Halonic 0.2.0, when `status` is called, then `live` gives Halonic 0.2.0 and the record's full commit.
- Given version B's record isn't JSON, when `plan` is called, then B's Halonic version and reaches are unknown.
