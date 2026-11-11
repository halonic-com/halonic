# @halonicjs/studio-feature-settings

The Settings feature of the Studio: the sections Appearance, Formats and Assistant, and the
settings that save by themselves (board, HAL-1102). The shell owns the Settings dialog itself;
this package fills its sections.

- **Layer:** studio
- **Owner:** elena
- **Public API:** `@halonicjs/studio-feature-settings` (the feature) and `@halonicjs/studio-feature-settings/api`

## Display settings

Appearance, Formats and Developer are `display` settings: they belong to this computer (or this
browser, when served) and to every workspace, never to a workspace file (`settings.display-prefs`).
They are kept behind the `DisplayPrefs` port. `BrowserDisplayPrefs` keeps them in browser storage;
the desktop app's profile adapter follows when the app wires features in.

`DisplaySettings` reads and saves them. A change shows at once and is stored straight away. If
storing fails, the stored value comes back and the failure stays on that setting until it
next saves (`settings.failed-save`), so Settings can show it under the control and say it in the
dialog, never in a toast. A stored value the setting doesn't accept starts from the default.

## Example

```ts
import { BrowserDisplayPrefs, type DisplayPref, DisplaySettings } from "@halonicjs/studio-feature-settings";

const theme: DisplayPref<"system" | "light" | "dark"> = {
  key: "appearance.theme",
  fallback: "system",
  read: (stored) => (stored === "light" || stored === "dark" || stored === "system" ? stored : undefined),
};

const settings = new DisplaySettings(new BrowserDisplayPrefs(window.localStorage, window));
const outcome = await settings.set(theme, "dark");
if (!outcome.saved && !outcome.superseded) {
  // The theme is back to outcome.back, and settings.failure(theme) says why. A superseded save
  // went nowhere back: a newer change to the theme came in, and its outcome is the one to tell.
}
```
