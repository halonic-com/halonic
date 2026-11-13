# plugins.plugin-add

- Status: active
- Since: 0.1.0
- Source: HAL-1740; plugin screens design section 4 (HAL-1739); microcopy 24 T5; UX acceptance checklist 3 (HAL-1952)

The Studio shall give **Add plugin** a dialog with two ways in: a folder on this computer, and a git repository with an optional branch, tag or version. **Add** shall stay pressable while the field is empty and say "Enter a folder or a git address." While the app copies the plugin, the button shall say "Getting *name*…" and the fields shall be unavailable. When the app adds the plugin, the dialog shall hand its id on so the trust check can open. When it can't, a `danger` callout shall say why and that nothing was installed, and the button shall become **Try again**. A plugin that is already installed shall offer **Open *name***. What the plugin or the computer says shall only ever be shown as plain text.

## Examples

- Given the dialog is open,
  when the person presses **Add** with the folder empty,
  then it says "Enter a folder or a git address." and nothing is asked of the app.
- Given a git address and the version `v1.2.0`,
  when the person presses **Add**,
  then the app is asked for that address and that version.
- Given the app takes a while,
  then the button says "Getting halonic-weather…".
- Given the app adds `weather`,
  then the dialog reports `weather` as added.
- Given the plugin.yaml has 2 problems,
  then the callout says "Can't add halonic-weather. Its plugin.yaml has 2 problems. Nothing was installed." and lists each problem's place and message, and the button says **Try again**.
- Given the plugin `weather` is already installed,
  then the callout says "A plugin called weather is already installed. Update it from its page." and **Open weather** opens it.
- Given the machine is offline, then it says "Couldn't reach github.com: you're offline."; given the folder has no plugin.yaml, then it says "That folder has no plugin.yaml."
