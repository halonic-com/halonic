# action-catalog.google-create-test-account

- Status: active
- Since: unreleased
- Source: stream HAL-17488 (user-only action steppers); architecture note on HAL-17491, sections 1.2, 7.8 and 7.9; task HAL-17554

When a request names `google.create-test-account@1`, the action-catalog package shall offer only `guided` steps that open an `https` address on Google's sign-up page's declared web origin with numbered instructions for creating a Google test account, ask for no secret, preview them in one sentence that says Halonic can't check it, and give a manual guide, built by the stepper's own manual guide from the same definition, that is a numbered list holding that address.

## Examples

- Given the parameters of the `acme` examples in the tests,
  when the manual guide is built,
  then its first numbered line is `1. Open https://accounts.google.com/signup` and every following instruction is numbered.
- Given a parameter with a path trick, an undeclared key or a value outside its pattern,
  when the parameters are parsed,
  then they are refused.
