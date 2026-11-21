# first-run.pick-model-stale-answers

- Status: active
- Since: unreleased
- Source: HAL-13432; first-run-flow revision 7, section 3.3, 6 and 8e, approved by the board on HAL-7993; the rule is Liam's review of #3960 on HAL-13431

The Pick a model screen shall act only on the answer of the newest test it started. An answer to an earlier test, passed or failed, or to a test whose choice, provider, model or key the person changed since, shall change nothing on the screen and shall not continue.

## Examples

- Given a test, then a second one after the key was edited, and the first one fails after the second passed,
  then the screen continues with the second test, and shows no failure.
- Given a test, then the provider switched to OpenAI, and the Anthropic test fails afterwards,
  then the screen stays on OpenAI with no failure line.
