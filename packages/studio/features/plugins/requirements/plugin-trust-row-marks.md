# plugins.plugin-trust-row-marks

- Status: active
- Since: unreleased
- Source: HAL-3384; the "Runs" line design sections 3 and 5 (HAL-1873); design check c508 M7 and M8 (HAL-14931); extends plugins.plugin-trust-runs-line and plugins.plugin-trust-setting-address

Where the host says plugin code doesn't run in the sandbox on this computer, the plugin trust check's Programs row shall start with the warning triangle (`kit.disclosure-warning-mark`), and keep its name "Programs (*n*)". The trust check shall show an Addresses row for a host from a setting in the text colour, with only "· *where the host may be*", or the "(from …)" after a value that's set, in the muted colour.

## Examples

- Given Weather has a program and plugin code isn't in the sandbox,
  then the Programs row shows the triangle before "Programs (1)", and is read as "Programs (1)".
- Given plugin code runs in the sandbox,
  then the Programs row has no triangle.
- Given Weather's backend reaches `{ fromSetting: station, class: private }`,
  then "The address you enter in Weather's settings, under Station address" is in the text colour and "· only on your home network" is muted.
