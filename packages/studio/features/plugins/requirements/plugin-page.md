# plugins.plugin-page

- Status: active
- Since: 0.1.0
- Source: HAL-1740; plugin screens design section 7 (HAL-1739); microcopy 24 T7 and T12 (HAL-751); UX acceptance checklist 6.1 to 6.4 (HAL-1952); T16-F13 to F16; Liam's review of #2065

The Studio shall open a plugin's page in a tab, as the item kind `plugin`, at `plugin/this-computer/<plugin>`, named by the plugin's name. The page shall show "Plugin" and the plugin's name as its heading, not as a field that renames it, and **Open panel** when the plugin has a panel, which opens the panel's item. It shall show the plugin's description in quotes, then one status box: "On" with "Trusted on *date* · version *version* · from *source*" while the plugin is on; "Not trusted yet" with "Nothing from this plugin runs until you trust it."; "Changed since you trusted it on *date*" with "It's off until you look at what changed."; or, when the plugin can't load, a danger Callout "*name* couldn't load." with "Its tools, commands and cards are off until its plugin.yaml is fixed." and each problem, where in mono, then the message. It shall show the plugin's settings, and under "What it adds" its tools for agents, each with its description in quotes and the chip "Reads", "Changes things" or "Sends", then "Give them to an agent with a connector.", its commands "· in Ctrl K", its cards "· on Home" and its panel "· opens in a tab". While the plugin isn't on, the settings and what it adds shall stay readable, and the settings fields shall be unavailable with the status box as the reason. All of the plugin's text shall show as plain text. When the plugin is removed, the page shall show nothing and its kind shall say the item no longer exists.

## Examples

- Given the Weather plugin is on, trusted on 3 Nov, version 1.2.0, from `https://github.com/example/halonic-weather.git`,
  when its page opens,
  then it shows "Plugin", the heading "Weather", **Open panel**, "On" and "Trusted on 3 Nov · version 1.2.0 · from github.com/example/halonic-weather".
- Given the same,
  when the person presses **Open panel**,
  then the item `plugin-panel/this-computer/weather` opens.
- Given the Weather plugin with the read tool `forecast`, the command "Show the forecast", the card "Today's weather" and the panel "Weather",
  when its page opens,
  then What it adds lists `forecast` with "Reads" and "“The forecast.”", "Show the forecast · in Ctrl K", "Today's weather · on Home" and "Weather · opens in a tab".
- Given the Weather plugin isn't trusted yet and has the setting "City",
  when its page opens,
  then the status box says "Not trusted yet" and "Nothing from this plugin runs until you trust it.", and the field "City" is unavailable.
- Given the Weather plugin can't load because its command uses the tool `send_email`, which sends,
  when its page opens,
  then it shows "Weather couldn't load." and that problem after `plugin.yaml ui.commands.0.tool`.
- Given the description `<b>Hi</b> [x](javascript:alert(1))`,
  when the page opens,
  then it shows those characters in quotes, with no bold text and no link.
