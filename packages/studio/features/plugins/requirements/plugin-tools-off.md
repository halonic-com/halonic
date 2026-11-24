# plugins.plugin-tools-off

- Status: active
- Since: unreleased
- Source: HAL-17815; C3 option (a) on HAL-12374, approved by the board on 24 Nov, with its wording; HAL-12391 (the desktop's agent host is the single executable, so plugin tools are off there)

The Studio shall ask the app whether this build has plugin tools once, the first time Ctrl K, Home or Settings › Plugins needs it, and not when a folder opens. When the app says this build of Halonic has no plugin tools, the Studio shall leave plugin commands out of Ctrl K and leave Home's Cards section out, and Settings › Plugins shall say "Plugin tools aren't in this build of Halonic yet." once, above the plugins, which it still lists. While the app hasn't answered, when it can't say, and when it says the build has plugin tools, the cards, the commands and the list shall be as they are without this requirement, with no such line.

## Examples

- Given a build without plugin tools and the Weather plugin on, with the command "Show the forecast" and the card "Today's weather",
  when Ctrl K lists the commands,
  then "Show the forecast" isn't there.
- Given the same,
  when Home shows,
  then there's no Cards section and no tool is called.
- Given the same,
  when Settings › Plugins shows,
  then it says "Plugin tools aren't in this build of Halonic yet." once, and lists Weather.
- Given a build with plugin tools, or an app that can't say,
  when Ctrl K, Home and Settings › Plugins show,
  then "Show the forecast" and "Today's weather" are there and the line isn't.
