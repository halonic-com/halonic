# plugins.plugin-panel

- Status: active
- Since: 0.1.0
- Source: HAL-1740; plugin screens design section 8.3 and decision D2 (HAL-1739, HAL-1801); microcopy 24 T12 and T16 (HAL-751); UX acceptance checklist 9, B3 and G7 (HAL-1952); T16-F24 and F44

The Studio shall open a plugin's panel in its own tab, as the item kind `plugin-panel`, one tab per plugin, named by the panel's title. The panel shall show "Plugin panel" over the panel's title as its heading, "From the *name* plugin", the plugin's commands as buttons, its cards as on Home, and the line "Everything on this page comes from the *name* plugin and is drawn by Halonic.". A command's button shall open that command's dialog, the same as in Ctrl K. While the plugin is on, Ctrl K shall offer "Open *name* panel" from the source "*name* plugin", through the command source `plugins.panels`. While the plugin isn't on, its cards shall show their states, and its command buttons shall be unavailable, with the plugin's status line as the reason: "Nothing from this plugin runs until you trust it.", "It's off until you look at what changed." or "*name* couldn't load. Its tools, commands and cards are off until its plugin.yaml is fixed.". When the plugin is removed or has no panel any more, the panel shall show nothing and its kind shall say the item no longer exists.

## Examples

- Given the Weather plugin is on with the panel "Weather", the command "Show the forecast" and the card "Today's weather",
  when its panel opens,
  then it shows "Plugin panel", the heading "Weather", "From the Weather plugin", the button "Show the forecast", the card and the closing line.
- Given the Weather panel is open,
  when the person presses "Show the forecast",
  then that command's dialog opens.
- Given the Weather plugin is on,
  when Ctrl K lists its commands,
  then it lists "Open Weather panel" from "Weather plugin", which opens the tab `plugin-panel/this-computer/weather` named "Weather".
- Given the Weather panel is open,
  when the plugin changes on disk,
  then the button "Show the forecast" is unavailable with the reason "It's off until you look at what changed.", and the card says "Weather isn't trusted yet, so this card is empty.".
- Given the Weather panel is open,
  when the plugin is removed,
  then the panel shows nothing and the kind says it doesn't exist.
