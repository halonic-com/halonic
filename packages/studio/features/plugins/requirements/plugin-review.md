# plugins.plugin-review

- Status: active
- Since: 0.1.0
- Source: HAL-1740; plugin screens design sections 5 and 7 (HAL-1739); UX acceptance checklist 4 and 6 (HAL-1952)

The Studio shall give the status box of a plugin's page that isn't trusted yet a **Review** button, and the one of a plugin that has changed a **Review changes** button, and none while the plugin is on. Either shall open the plugin's trust check with the title "Trust *name*?" and the button **Trust**. Pressing **Trust** shall trust the plugin through the app and close the dialog. **Not now** shall close it and trust nothing. When trust can't be saved, the dialog shall stay open and say "Couldn't save trust: *reason*. Nothing was started."

## Examples

- Given the Weather plugin isn't trusted yet,
  when the person presses **Review**,
  then the dialog "Trust Weather?" opens with **Not now** focused.
- Given the same,
  when the person presses **Trust**,
  then the app trusts `weather` and the dialog closes.
- Given the same,
  when the person presses **Not now**,
  then the dialog closes and nothing is trusted.
- Given trusting fails with "The store is locked.",
  when the person presses **Trust**,
  then the dialog stays open and says "Couldn't save trust: The store is locked. Nothing was started."
- Given the Weather plugin has changed,
  then its status box has **Review changes**; given it is on, it has no Review button.
