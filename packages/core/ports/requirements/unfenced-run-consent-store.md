# ports.unfenced-run-consent-store

- Status: active
- Since: 0.1.0
- Source: HAL-3385; the I5 design on HAL-958 (4.3.1: the yes is the user's own, saved in their profile with its reason, never in a workspace, no CLI flag); the "Runs" line design on HAL-1873 (sections 7 and 11), approved by the board on HAL-1949

The ports package shall have an `UnfencedRunConsentStore` port that gets, saves and removes the user's one yes to run plugin and integration code without the sandbox on this computer, where the yes holds the reason it was given for and the time. The port shall only store the yes: it shall have no method that decides whether code may run.

The port's documentation shall state that the yes lives in the user's profile and never in a workspace, sheet, setting or config file, that only Studio saves it, that a yes that can't be read makes `get` throw, and that `remove` still deletes it.

## Examples

- Given the `UnfencedRunConsentStore` port,
  when its methods are read,
  then they are exactly `get`, `save` and `remove`, and `get` and `remove` take nothing.
- Given `UnfencedRunConsentStore.get`,
  then it returns an `UnfencedRunConsent` or `null`.
- Given an `UnfencedRunConsent` for `windows`,
  when it is compiled,
  then it compiles; one without a reason or without a time doesn't.
