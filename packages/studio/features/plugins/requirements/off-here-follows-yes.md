# plugins.off-here-follows-yes

- Status: active
- Since: unreleased
- Source: flow check C565 row 3 (HAL-15351, HAL-15373); `plugins.plugin-page-needs-yes` and the Plugins list's "Off on this computer" (C540, HAL-15080), which ask the host the same way

When the app says the window's yes to run plugin code without the sandbox changed, such as after a Take back in Settings › Agent sandbox, the Plugins feature shall read the host's status again for an open plugin page and for the Plugins list, so that the page shows R13's Callout whenever the list shows "Off on this computer", without the page being closed and opened again.

## Examples

- Given Acme orders, with a backend, is on, a yes for `container` is saved and its page is open in a tab,
  when the yes is taken back in Settings and the host now says a yes is needed,
  then the open page shows "Acme orders is off on this computer until you allow plugins and integrations to run without the sandbox." in place of its status box.
- Given the Plugins list shows Weather on,
  when the yes is taken back,
  then the list asks the host again and shows Weather as off on this computer.
