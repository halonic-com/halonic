# settings.unfenced-yes-take-back

- Status: active
- Since: unreleased
- Source: HAL-3384; words check C553 rows 18, 22 and 23 (HAL-15227); microcopy 24.1 R16 (HAL-751, approved on HAL-1949); the "Runs" line design section 7 (HAL-1873); design check C551 (HAL-15217, HAL-15246)

While the app gives the window's yes to run plugin and integration code without the sandbox and the host says that code doesn't run in the sandbox on this computer, the Settings feature shall show in Agent sandbox the heading "Plugins and integrations" and the line "The agent sandbox runs agents' programs. On Windows, plugin and integration code can't run in it yet, so it needs your yes." for the reason `windows`, or "The agent sandbox runs agents' programs. Plugin and integration code can't run in it on this computer, so it needs your yes." for any other reason; while a yes is saved, it shall also show "Allowed without the sandbox", the reason in the words of `runnerUnfencedWords` followed by "Allowed on *day*." (for the reason `windows` only "Allowed on *day*.", since the line above already says why; without the day when the day the yes was saved can't be read), a **Take back** button and the line "Taking it back stops plugins and integrations that run without the sandbox. Halonic asks again the next time one starts.". When **Take back** is pressed, the Settings feature shall ask the host to take the yes back, and only once the host has answered shall it say "Taken back." with "Plugins and integrations won't start without the sandbox until you allow it again.", read the status again and move the focus to the heading: on the phone's Settings page as a toast, and in the Settings dialog as a quiet line under the heading that the Settings live region also announces. If the host can't take it back, the Settings feature shall keep showing the yes and say "Couldn't take it back" with the reason the shell's `errorReasonFor` gives ("Halonic ran into a problem it can't explain yet." for an internal error): on the phone's Settings page as a toast with **Try again**, which does nothing while a Take back is still running, and in the Settings dialog as the danger line "Couldn't take it back: *reason*" under **Take back**, announced, with the focus kept on **Take back**. If the host can't say whether a yes is saved, the Settings feature shall show the heading, "Couldn't check whether plugins and integrations may run without the sandbox." and **Try again**, which reads the status again, and nothing that claims a yes. While plugin code runs in the sandbox, the Settings feature shall show none of this.

## Examples

- Given the host says a yes for `windows` was saved on 9 Nov,
  when Settings › Agent sandbox opens,
  then it reads "Allowed without the sandbox" and "Allowed on 9 Nov." with **Take back**, and doesn't repeat the Windows reason.
- Given the host can't say whether a yes is saved,
  when Settings › Agent sandbox opens,
  then it reads "Plugins and integrations" and "Couldn't check whether plugins and integrations may run without the sandbox." with **Try again**, and no **Take back**.
- Given **Take back** is pressed,
  when the host is still stopping the plugins that run without the sandbox,
  then nothing is said yet and **Take back** is busy.
- Given the Settings dialog is open and the host has taken the yes back,
  when the result shows,
  then "Taken back. Plugins and integrations won't start without the sandbox until you allow it again." reads under the heading, not as a toast.
- Given the host says plugin code runs in the sandbox,
  when Settings › Agent sandbox opens,
  then there is no "Plugins and integrations".
