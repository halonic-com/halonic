# plugins.feature

- Status: active
- Since: 0.1.0
- Source: HAL-1740; plugin screens design sections 7 and 8 (HAL-1739); decisions D2 and D3 (HAL-1801); Liam's reviews of #1829 and #1831

The plugins feature shall build each open workspace's plugins from what the app provides (`PluginsHostService`): the installed plugins as they change, and the way to call their tools, with the 30-second limit. It shall add, for the plugins of the workspace whose context asks: each command of each plugin that's on to Ctrl K, opening its dialog, which the feature draws in the window; "Open *name* panel" for each plugin that's on and has a panel, opening the panel's item so there's one tab per plugin; the `plugin-panel` item kind; and the Cards section on Home. A plugin that's off, changed or can't load shall give no commands. Review and Details on a card or a panel shall open the plugin's page, the item `plugin/this-computer/<plugin>`. Without a workspace's context, the feature shall give no commands.

## Examples

- Given the app provides the Weather plugin, on, with the command "Show the forecast" and a panel,
  when Ctrl K lists the commands for the workspace,
  then "Show the forecast" and "Open Weather panel" are there, each with the source "Weather plugin".
- Given the same,
  when the person runs "Show the forecast",
  then its dialog opens in the window.
- Given the same,
  when the person runs "Open Weather panel",
  then the item `plugin-panel/this-computer/weather` opens.
- Given the Weather plugin isn't trusted yet,
  when Ctrl K lists the commands,
  then neither of its commands is there, and Review on its card opens `plugin/this-computer/weather`.
