# studio.first-run-model-test

- Status: active
- Since: unreleased
- Source: HAL-13431; first-run-flow revision 7, section 3.3 and 10.2 R4, approved by the board on HAL-7993; the security rules are Liam's plan on HAL-13431

When the first run's model screen tests a choice, Studio shall make one call through the model adapter a run uses, to the provider file a run would use, with only the pasted key as its secrets, and shall cut the call off at the choice's time limit (5 seconds for a key, 180 seconds for a local model). Pasted text that can't be a key, and a provider file the choice can't use, shall stop the test before any call.

## Examples

- Given a key for Anthropic in Acme,
  then one call goes to Anthropic's provider, made from the file the first run adds, and its secrets give the key under `anthropic-api-key` and nothing else.
- Given a key choice whose provider doesn't answer within 5 seconds,
  then the call is aborted and the outcome is `provider-error`.
- Given `https://console.anthropic.com` as the key,
  then no call is made and the answer is `not-a-key`.
