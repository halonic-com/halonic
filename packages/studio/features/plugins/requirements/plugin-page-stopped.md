# plugins.plugin-page-stopped

- Status: active
- Since: unreleased
- Source: HAL-15113; microcopy 24.1 R15 (HAL-751, approved on HAL-1949); the "Runs" line design section 10, `rl-page-stopped` (HAL-1873); the host's side is `agent-host.plugin-run-state`; **Check again** forgetting the stop is a team decision on HAL-15113; its toast is words check C584 row 13 (HAL-15471), decided by the team on HAL-15482; R15's words follow what the host does (flow check C600 #4, decided by the team with Sofia on HAL-15608)

While a plugin with a backend is on and the agent host says it stopped that plugin because the sandbox didn't work as the plugin started, the Plugins feature shall show on the plugin's page, in place of the status box and before R13, a `danger` Callout "*Plugin* stopped: the sandbox didn't work as it started, so nothing ran." with "Halonic tries it in the sandbox again the next time a run uses it, never without it." under it, then **Check again**. When **Check again** is pressed, the Plugins feature shall ask the host to forget that plugin's stop, then show what the page shows without it, move focus there and say "Halonic tries *Plugin* in the sandbox again the next time a run uses it." in a polite toast, since nothing was tried yet; when that fails, it shall keep the Callout and say "Couldn't check again: *reason*." in a toast. Where the page is view only, the Callout shall have no **Check again**. The Plugins feature shall not ask the host about a plugin that isn't on or has no backend, and shall show the page as without R15 while the host says the plugin wasn't stopped or can't say.

## Examples

- Given Weather is on and the host says it stopped Weather,
  when the page opens,
  then it reads "Weather stopped: the sandbox didn't work as it started, so nothing ran." and "Halonic tries it in the sandbox again the next time a run uses it, never without it." with **Check again**.
- Given that Callout, when the person presses **Check again**,
  then the host forgets the stop, then the status box shows and has focus, and the toast says "Halonic tries Weather in the sandbox again the next time a run uses it."
- Given Weather isn't trusted yet,
  when the page opens,
  then the host isn't asked.
