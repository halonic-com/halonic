# plugins.plugin-trust-runs-line

- Status: draft
- Since: unreleased
- Source: HAL-3384; the "Runs" line design sections 2, 3 and 7 (HAL-1873); microcopy 24.1 R1 to R8, approved on HAL-1949; extends plugins.plugin-trust-check

When the host gives this computer's sandbox status for plugin code, the plugin trust check shall end with the line for that status. In the sandbox, it shall be "Plugin code runs apart from Studio and your files, and can only reach the addresses above. Halonic doesn't check what the plugin does with what it's given.", with "Its program runs in the agent sandbox." before the last sentence when the plugin has a program, and Addresses shall start with "The only addresses this plugin can reach." Not in the sandbox, for a plugin with a backend, it shall be the amber warning with a triangle, "Plugin code runs apart from Studio, but not in the sandbox on this computer, so it may be able to use your files, programs and sign-ins, and reach addresses not listed above.", then the reason, the fix and the docs link from `app.runner-unfenced-words`, then "Halonic doesn't check what the plugin does with what it's given."; Addresses shall start with "Addresses this plugin names. Without the sandbox, its code may connect elsewhere."; Programs shall be open; and, without a saved yes for that reason, the checkbox "I understand plugins and integrations run without the sandbox on this computer" shall show, with the primary unavailable but focusable until it's ticked, and **Trust** shall pass the reason on so the host can save the yes. With a saved yes for that reason, "You allowed plugins and integrations to run without the sandbox on this computer on *date*, for this reason." shall show instead of the checkbox. A plugin with only programs shall keep the short line and get no checkbox, with "Its program runs in the agent sandbox." in the sandbox. While the status is read, it shall say "Checking the sandbox on this computer…" with the primary unavailable. While checking, when stopped, or when the host doesn't say, the last line shall be the one `plugins.plugin-trust-check` names.

## Examples

- Given Weather, with a backend and a program, in the sandbox,
  then the last line is the longer line with "Its program runs in the agent sandbox." and there is no checkbox.
- Given Weather on Windows with no saved yes,
  then the amber line says "On Windows, plugin code can't run in the sandbox in this version of Halonic. Use Halonic inside WSL 2 on this computer." with the link "How to run Halonic in WSL 2", and **Trust and turn on** is unavailable until the box is ticked.
- Given the box is ticked,
  when the person presses **Trust and turn on**,
  then the host gets the reason `windows`.
- Given a yes saved on 9 Nov for `windows`,
  then the check shows "You allowed … on 9 Nov, for this reason." and no checkbox.
- Given a yes saved for `windows` and the reason is now `container`,
  then the checkbox shows again.
- Given a plugin with only programs on Windows,
  then the last line is "Plugin code runs apart from Studio. Halonic doesn't check what the plugin does with what it's given." and there is no checkbox.
- Given the host is still reading the status,
  then the check says "Checking the sandbox on this computer…" and **Trust and turn on** is unavailable.
