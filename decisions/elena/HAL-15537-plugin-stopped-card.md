# Decision: a plugin card and a command dialog name the plugin the host stopped, and link its page

- Task: HAL-15537
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-15488 (Liam's plan approval, comment b51bbc04: one PR, the host sends only the code `plugin_stopped`, Studio names the plugin it called and links its page; wording is a team call under HAL-2282, recorded on HAL-15537)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:G5gnzV0wZiDiaKWEmXFJr2Dgc7co1H0F73dFnRnspVeVNBh9N3lyO7kHDlcFyPA2boZSgM5F6PnfBGkhHUvrCA==

## What changes

Five active requirements are edited:

- `agent-host.plugin-routes`: when the computer passed the sandbox check but a runner's fence didn't hold, the host refuses the call with 403 `plugin_stopped` and its own fixed message ("Halonic stopped this plugin: its sandbox didn't hold, so it didn't run. The next call tries the sandbox again."), never the plugin's name or the error's text. It keeps the plugin's other parts running, as for `not_fenced`, and the next call tries the sandbox again. Before, the stop came back as an unexplained failure.
- `agent-host-client.plugins`: the page's message for `plugin_stopped` is "Halonic stopped this plugin: its sandbox didn't hold, so it didn't run. Try again to check the sandbox again."
- `plugins.plugin-cards`: a card whose plugin the host stopped says "Halonic stopped *name*: its sandbox didn't hold, so it didn't run. Open *name* to check again." with **Try again** and ↻; the second *name* opens the plugin's page.
- `plugins.plugin-commands` and `plugins.palette-commands`: the dialog's alert says "Halonic stopped *name*: its sandbox didn't hold, so it didn't run." with **Try again**, and under it "Open *name* to check again.", where *name* closes the dialog and opens the plugin's page. Where the window can't open pages, the name is plain italics.

New tests cover the host's refusal, its status and words, the retry at the next call, the other parts surviving, the client's words, the card, the dialog with and without a way to open pages, and the dialog host closing before the page opens. No test was weakened or skipped.

## Why

Since #4717 the opener fails a stopped start with `PluginBackendStoppedError`, which names the plugin. Outside a run, a card or a command dialog only showed "Couldn't get …" with the error's text. The host must not pass a plugin's name or an error's text to the page, so it sends a fixed code, and Studio names the plugin from the call it made, as the run page does for a plugin a step's connector didn't start for (#4695). The plugin's page has R15's **Check again**, so the line says "Open *name* to check again." and links it. Trying again may work, because the next call starts the runner again, so **Try again** stays. `plugin_stopped` uses the same 403 as `not_fenced`, and counts as one part that didn't start: each local tool proves its own fence, so one runner that was stopped doesn't stop them.

## Covers

- agent-host.plugin-routes
- agent-host-client.plugins
- plugins.plugin-cards
- plugins.plugin-commands
- plugins.palette-commands
