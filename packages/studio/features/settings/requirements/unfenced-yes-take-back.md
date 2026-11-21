# settings.unfenced-yes-take-back

- Status: active
- Since: unreleased
- Source: HAL-3384; microcopy 24.1 R16 (HAL-751, approved on HAL-1949); the "Runs" line design section 7 (HAL-1873)

While the app gives the window's yes to run plugin and integration code without the sandbox and the host says that code doesn't run in the sandbox on this computer, the Settings feature shall show in Agent sandbox the heading "Plugins and integrations" and the line "The agent sandbox runs agents' programs. On Windows, plugin and integration code can't run in it yet, so it needs your yes." for the reason `windows`, or "The agent sandbox runs agents' programs. Plugin and integration code can't run in it on this computer, so it needs your yes." for any other reason; while a yes is saved, it shall also show "Allowed without the sandbox", the reason in the words of `runnerUnfencedWords` followed by "Allowed on *day*." (without the day when the day the yes was saved can't be read), a **Take back** button and the line "Taking it back stops plugins and integrations that run without the sandbox. Halonic asks again the next time one starts.". When **Take back** is pressed, the Settings feature shall ask the host to take the yes back, and only once the host has answered shall it show the toast "Taken back." with "Plugins and integrations won't start without the sandbox until you allow it again.", read the status again and move the focus to the heading. If the host can't take it back, the Settings feature shall keep showing the yes and show the toast "Couldn't take it back" with the host's reason. While plugin code runs in the sandbox, or the host can't say, the Settings feature shall show none of this.

## Examples

- Given the host says a yes for `windows` was saved on 9 Nov,
  when Settings › Agent sandbox opens,
  then it reads "On Windows, plugin code can't run in the sandbox in this version of Halonic. Allowed on 9 Nov." with **Take back**.
- Given **Take back** is pressed,
  when the host is still stopping the plugins that run without the sandbox,
  then no toast shows yet and **Take back** is busy.
- Given the host says plugin code runs in the sandbox,
  when Settings › Agent sandbox opens,
  then there is no "Plugins and integrations".
