# action-catalog.npm-claim-placeholder

- Status: active
- Since: unreleased
- Source: stream HAL-17488 (user-only action steppers); architecture note on HAL-17491, sections 1.2, 7.8 and 7.9; task HAL-17555

When a request names `npm.claim-placeholder@1` with an npm `package` name, the action-catalog package shall offer one `guided` step that opens `https://www.npmjs.com/package/{package}` with numbered instructions for checking the name is free and publishing a placeholder version, preview it in one sentence that names the target and says Halonic can't check it, and give a manual guide, built by the stepper's own manual guide from the same definition, that is a numbered list holding that address. Every address is on `https://www.npmjs.com/`.

## Examples

- Given valid `acme` parameters,
  when the manual guide is built,
  then its first numbered line is `1. Open` followed by the `https://www.npmjs.com/…` address and every following instruction is numbered.
- Given a `package` of `../acme`,
  when the parameters are parsed,
  then they are refused.
