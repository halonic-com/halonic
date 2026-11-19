# workspace.narrow-window-trust

- Status: active
- Since: unreleased
- Source: trust-badge (`workspace.trust-badge`), narrow-window (`workspace.narrow-window`), WCAG 1.4.10; HAL-13138 (NW1), HAL-13144

While the desktop app's window is as narrow as a phone (or zoomed until it is) and the shown workspace has been checked and isn't trusted, More shall show the header badge "Not trusted yet · Review" on its own line under the workspace row, before the workspace's other header badges, as the status bar orders them. Pressing it shall open the same trust check the status bar's badge opens. While the workspace isn't trusted, the sample chip shall stay away there too.

## Examples

- Given the window is phone-narrow and shows "Acme sample", remembered as the sample and not trusted yet,
  when the user opens More,
  then the button "Not trusted yet. Review" is on the line under the workspace row, and there is no sample chip.
- Given that, when the user presses "Not trusted yet. Review", then the trust check "Trust Acme sample?" opens.
