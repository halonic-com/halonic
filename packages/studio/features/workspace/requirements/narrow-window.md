# workspace.narrow-window

- Status: active
- Since: unreleased
- Source: try-sample (`workspace.try-sample`), served-picker (`workspace.served-picker`), WCAG 1.4.10; HAL-12721 (L11), HAL-12729

While the desktop app's window is as narrow as a phone (or zoomed until it is), More shall start with the workspace row, which opens the workspace menu's rows as a sheet titled "Workspace", and, when the shown workspace has a header badge, show it on its own line under that row. Picking a row of the sheet shall close it and do what the menu row does. The sample chip there shall open a sheet titled "Sample answers" with the cost line, **New workspace…** and **Fresh copy of the demo**, which do what they do in the chip's menu.

## Examples

- Given the window is phone-narrow and shows "Acme sample", remembered as the sample and trusted, and "Beta" is remembered,
  when the user opens More,
  then the workspace row reads "Acme sample", and the chip "Sample answers" is on the line under it.
- Given that, when the user presses the workspace row and then "Beta", then the sheet closes and "Beta" is shown.
- Given that, when the user presses the chip and then **Fresh copy of the demo**, then the sheet closes and the host is asked for a fresh copy.
