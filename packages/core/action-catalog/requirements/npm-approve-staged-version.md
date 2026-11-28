# action-catalog.npm-approve-staged-version

- Status: active
- Since: unreleased
- Source: stream HAL-17488 (user-only action steppers); architecture note on HAL-17491, sections 1.2, 7.8 and 7.9; task HAL-17551; release review (the release owner checks a staged version's provenance before approving it)

When a request names `npm.approve-staged-version@1` with `scope`, `package`, a `version` and the full `commit` the release was built from, the action-catalog package shall offer:

- a `guided` step that opens `https://www.npmjs.com/settings/~/staged-packages` with numbered instructions for finding the staged version, checking that its provenance names `commit` (rejecting it otherwise), and approving it with the user's second factor;
- a `guided` step that opens `https://www.npmjs.com/package/@{scope}/{package}/v/{version}`, where the user checks that the version is public.

The definition shall be `irreversible`, preview each step in one sentence that names the package and version and says Halonic can't check it, and give a manual guide, built by the stepper's own manual guide from the same definition, that is a numbered list holding `https://www.npmjs.com/package/`. Every address is on `https://www.npmjs.com/`. A `version` with build metadata (`+`) or without three numbers is refused.

## Examples

- Given `acme` / `app`, version `1.4.0` and commit `4f2c9e1…`,
  when the manual guide is built,
  then it is a numbered list that opens the staged packages, names the commit to check, and ends on `https://www.npmjs.com/package/@acme/app/v/1.4.0`.
- Given the version `1.4.0+build.7`,
  when the parameters are checked,
  then they are refused.
