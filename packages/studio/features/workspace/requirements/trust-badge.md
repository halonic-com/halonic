# workspace.trust-badge

- Status: active
- Since: 0.1.0
- Source: states-flow-map T2 to T6, K4, F8, I1, I3, R2 and R4 (HAL-5878), mockup-trust rev 2 (HAL-1018); HAL-1291, HAL-8559

While the shown workspace has been checked and isn't trusted, the window shall show the header badge "Not trusted yet · Review", as one button. Before the first check and once the workspace is trusted it shall show nothing. Pressing the badge shall open the trust check as a dialog with **Not now** focused: the first-time check, or "What changed" when the workspace has a record that no longer matches. **Not now**, Escape and a click outside shall leave the check without saving anything. **Trust** shall save the person's trust in exactly the check shown, close the dialog and say "*name* can run now"; when saving fails, the dialog shall stay open and say "Couldn't save trust: *reason*. Nothing was started." A program whose version isn't pinned shall keep **Trust** unavailable until the person confirms it can download new code. A workspace that can't be trusted at all shall keep **Trust** unavailable and say why. When the workspace changes while the dialog is open, the dialog shall show the new check and say so.

## Examples

- Given an untrusted workspace is shown,
  then the header has the badge "Not trusted yet. Review" and no other trust text.
- Given the person presses the badge and then **Not now**,
  then the dialog closes, nothing is saved and the badge stays.
- Given the person presses **Trust** in "Trust Acme?",
  then trust is saved for the fingerprint shown and a toast says "Acme can run now".
- Given saving fails because the disk is full,
  then the dialog stays open and says "Couldn't save trust: the disk is full. Nothing was started."
