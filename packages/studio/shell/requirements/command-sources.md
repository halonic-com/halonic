# shell.command-sources

- Status: active
- Since: 0.1.0
- Source: HAL-1740; plugins design 8.1 (HAL-1739); plugins UX checklist 7 and 16, B2 and B6 (HAL-1952)

The shell shall let a feature add a command source through `commands.addSource`: commands that come and go while Studio runs, such as those of the plugins that are on. Each time the shell lists commands or looks one up, it shall ask every source for its commands as they are then, and list them with the feature that added the source. The shell shall leave out a source's command that can't be read, whose id doesn't start with the source's id and a dot, isn't a valid id or repeats one, whose title isn't text or whose source is given but isn't text, and every command of a source that throws or doesn't give a list, so the other commands still show. If two sources share an id, or a command or another source has an id that starts with a source's id and a dot, then the shell shall throw a `ShellError`. When a command has a `source`, the palette shall show it beside the command's title and name the option with the title, then the source.

## Examples

- Given _plugins_ adds the source `plugins.commands`, which gives `plugins.commands.weather.forecast` while the Weather plugin is on,
  when the plugin is turned off and the commands are listed again,
  then `plugins.commands.weather.forecast` isn't there.
- Given the source `plugins.commands` gives `agents.new`,
  when the commands are listed,
  then `agents.new` isn't there.
- Given one source throws and _agents_ adds `agents.new`,
  when the commands are listed,
  then `agents.new` is there.
- Given the source `plugins.commands` gives a command without a title, and the source `plugins.none` gives nothing instead of a list,
  when the commands are listed,
  then neither is there and the other commands are.
- Given _plugins_ adds the source `plugins.commands` and _agents_ adds the command `plugins.commands.new`,
  when the shell is created,
  then a `ShellError` naming both is thrown.
- Given the Weather plugin's command "Show forecast" with the source "Weather plugin",
  when the palette lists it,
  then the row shows "Weather plugin" beside the title and a screen reader reads "Show forecast, Weather plugin".
