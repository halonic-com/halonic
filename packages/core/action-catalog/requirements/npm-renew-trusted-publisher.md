# action-catalog.npm-renew-trusted-publisher

- Status: active
- Since: unreleased
- Source: stream HAL-17488 (user-only action steppers); architecture note on HAL-17491, sections 1.2, 7.8 and 7.9; task HAL-17555

When a request names `npm.renew-trusted-publisher@1` with `scope`, `package`, `owner`, `repo`, `workflow` and `environment`, the action-catalog package shall offer one `guided` step that opens `https://www.npmjs.com/package/@{scope}/{package}/access` with numbered instructions for deleting the lapsing trusted publisher and adding it again, preview it in one sentence that names the target and says Halonic can't check it, and give a manual guide, built by the stepper's own manual guide from the same definition, that is a numbered list holding that address. Every address is on `https://www.npmjs.com/`.

## Examples

- Given valid `acme` parameters,
  when the manual guide is built,
  then its first numbered line is `1. Open` followed by the `https://www.npmjs.com/…` address and every following instruction is numbered.
- Given a `package` of `../acme`renew-trusted-publisher or a workflow file such as `publish.sh`,
  when the parameters are parsed,
  then they are refused.
