# first-run.pick-model-testing

- Status: active
- Since: unreleased
- Source: HAL-13432; first-run-flow revision 7, section 3.3, 6 and 8e, approved by the board on HAL-7993

While a local model's test runs, the Pick a model screen shall say it is loading, and after 30 seconds that it is still loading. A test that didn't pass shall stop the screen with the reason from section 3.3, in amber when the key or the model works but the run would fail (no credit, a model too small) and in red otherwise, and the person shall not continue.

## Examples

- Given a local test still running after 30 seconds,
  then the screen says it is still loading.
- Given a key whose account has no credit,
  then the reason is amber, and the screen doesn't continue.
- Given a refused key,
  then the reason is red.
