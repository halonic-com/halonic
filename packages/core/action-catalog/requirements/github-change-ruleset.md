# action-catalog.github-change-ruleset

- Status: active
- Since: unreleased
- Source: stream HAL-17488 (user-only action steppers); architecture note on HAL-17491, sections 1.2, 5 (row 1) and 7.8; task HAL-17518; plan approved on HAL-20151 (option a)

When a request names `github.change-ruleset@1` with a GitHub `owner`, `repo` and integer `rulesetId`, the action-catalog package shall offer one `guided` step of risk `admin` that opens `https://github.com/{owner}/{repo}/settings/rules/{rulesetId}` with numbered instructions for changing the ruleset's required checks or merge queue, preview it in one sentence that names the ruleset and the repository and says Halonic can't check it, and give a manual guide, built by the stepper's own manual guide from the same definition, that is a numbered list holding that address.

## Examples

- Given the parameters `owner` `acme`, `repo` `app` and `rulesetId` `4021`,
  when the preview is built,
  then it is one sentence naming ruleset 4021 of `acme/app` and saying Halonic can't check it.
- Given the same parameters,
  when the manual guide is built,
  then its first numbered line is `1. Open https://github.com/acme/app/settings/rules/4021` and every following instruction is numbered.
- Given the `rulesetId` `0` or a `repo` of `../secrets`,
  when the parameters are parsed,
  then they are refused.
