# shell.welcome-sample-error

- Status: active
- Since: unreleased
- Source: first-run walk-through of the 0.2.0 build, gap G7; HAL-19383, HAL-19398

When the demo can't be copied, the welcome screen shall say why directly under the **Open demo** that was pressed, both while it leads and while it is the quiet link under Recent, and never next to **Open folder**. Under that line it shall offer **Try again**, which copies the demo again as **Open demo** does, and, when the app can copy the demo into another folder, **Choose a folder…**, which shows the folder picker and copies the demo into the folder picked. The line's words stay those of `shell.welcome-sample`. Cancelling the picker shall change nothing but the line, which goes.

## Examples

- Given Recent has entries and the demo can't be copied to Documents, then "Couldn't copy the demo to Documents: permission denied." shows under the **Open demo** link, with **Try again** and **Choose a folder…** under it.
- Given that error, when the user presses **Choose a folder…**, then the app's folder picker shows, and the demo is copied into the folder picked.
- Given that error, when the user presses **Try again**, then the demo is copied to Documents again.
