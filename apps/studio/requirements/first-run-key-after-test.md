# studio.first-run-key-after-test

- Status: active
- Since: unreleased
- Source: HAL-13431; first-run-flow revision 7, section 3.3 and 10.2 R4, approved by the board on HAL-7993; the security rules are Liam's plan on HAL-13431

Studio shall save a pasted key only when Continue names a test of it that passed, and shall keep the tested key only in memory until then. Continue shall take the test's id, never a key. A failed test, an unknown id, an id already continued, or the id of a test a newer test replaced, shall save nothing, and a test that ends after a newer one started shall keep no key.

## Examples

- Given a test that found the key refused,
  then there is no id to continue with, and no key is saved.
- Given a passed test continued once,
  then continuing with its id again saves nothing and fails with `no-test`.
- Given a passed test, then a second test,
  then the first test's id saves nothing.
- Given a slow test that ends after a second test passed,
  then the slow one is `superseded`, and only the second test's id continues.
