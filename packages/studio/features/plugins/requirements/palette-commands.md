# plugins.palette-commands

- Status: active
- Since: 0.1.0
- Source: HAL-1740; plugin screens design section 8.1 (HAL-1739); UX acceptance checklist 7, B2 and B6 (HAL-1952); Liam's review of #1705 (HAL-5306)

The Studio shall add each command of each trusted plugin to Ctrl K through the command source `plugins.commands`, as `plugins.commands.<plugin>.<command>`, with the command's title and the source "*name* plugin", and only while the plugin gives it. Running one shall open that command's dialog, in place of a dialog that's open, and Cancel or Close shall close it. A dialog opened again shall start fresh. A command without a form shall run once its dialog has mounted, also when React mounts it twice. If a plugin's tool doesn't answer within 30 seconds, then the call shall fail with "the plugin didn't answer in 30 seconds", so the dialog offers Try again.

## Examples

- Given the Weather plugin gives the command `forecast` titled "Show the forecast",
  when Ctrl K lists its commands,
  then it lists `plugins.commands.weather.forecast` as "Show the forecast" from "Weather plugin".
- Given the Weather plugin is turned off,
  when Ctrl K lists its commands again,
  then "Show the forecast" isn't there.
- Given the person runs "Show the forecast" from Ctrl K,
  when they press Cancel,
  then its dialog closes.
- Given a command without a form rendered in React's StrictMode,
  when its tool answers,
  then the Result box shows the answer.
- Given the tool `forecast` never answers,
  when 30 seconds pass,
  then the dialog says "Couldn't run Show the forecast: the plugin didn't answer in 30 seconds." with Try again.
