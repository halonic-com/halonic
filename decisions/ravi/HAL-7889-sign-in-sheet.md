# Decision: the Integration port is at version 2, and a newer-than-this kit is what the loader refuses

- Approval: design HAL-984 v0.4, decision 2 (`kit: 2` for `signIns`, the loader refuses a too-new `kit` with a plain message), approved by Liam on HAL-1080 and Julian on HAL-1081; built in HAL-7889
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:798eHMMbSBnOJccTGUux/BnBbSUIGdfMtIZ59U5Happoy6B3O82Wxxb38Of0T6Vt0WMl5Uqoqxp3oCJCdB6tCA==
- Task: HAL-7889

## What changes

`integrationVersion` goes from 1 to 2, because version 2 is the first with the sheet's `signIns` and the sign-in placement. Version 2 only adds, so the loader, the plugin loader and the plugin folder reader now refuse a `kit` or `sdk` newer than this Halonic's, instead of any other than this Halonic's, and say it needs a newer Halonic. An integration or plugin built for version 1 loads as before. Each requirement below keeps its meaning for what it tested and changes only in that rule and its example (`kit: 2` or `sdk: 2` is now valid, so the examples that refused them use 3):

- `integration-kit.loader`: the kit rule, its `kit: 3` example, and two new examples (an older kit loads; a client secret is read for the filter with no placement), and, after Liam's review, a local integration whose sheet declares `signIns` is refused as `sign-ins-not-allowed` until the trust content shows them.
- `integration-kit.placement-from-sheet`: after Liam's review, one new rule and example: a placement with a `signIn` key is refused as `sign-in-not-placed-yet`, because the kit doesn't place a token yet.
- `integration-kit.plugin-load`: `sdk-version` when the `sdk` is newer, not when it differs.
- `integration-kit.spec-files`: the `$id` example ends in `v2.schema.json`.
- `app.plugin-folder`: the `sdk` rule and the `kit: 3` example, and, after Liam's review, an `integration.yaml` that declares `signIns` is refused as `backend-sign-in`.
- `integration.plugin-conformance`: the `sdk` rule and the `sdk: 3` example.

The four spec files are goldens of the same change: the format's `integration` and `plugin` schemas gain `signIns` and the client secret form, and the kit's two spec files name `v2` in their `$id`. They are regenerated with `SPEC_WRITE=1`, not edited by hand.

Their tests change the same way: the numbers that stood for "another version" become 3, and one test is added for each older kit that must still load. No test is removed or weakened.

## Why

The sheet's `signIns` needs a `kit` that says which Halonic can read it. Keeping the check at equality would refuse every version 1 integration the moment the port moves to 2.

## Covers

- integration-kit.loader
- integration-kit.placement-from-sheet
- integration-kit.plugin-load
- integration-kit.spec-files
- app.plugin-folder
- integration.plugin-conformance
- packages/adapters/integration-kit/spec/integration.schema.json
- packages/adapters/integration-kit/spec/secret-placement.schema.json
- packages/core/format/spec/integration.schema.json
- packages/core/format/spec/plugin.schema.json
