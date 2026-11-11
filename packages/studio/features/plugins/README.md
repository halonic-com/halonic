# @halonicjs/studio-feature-plugins

The Studio side of plugins. Studio draws everything a plugin shows: the plugin only describes it in its manifest's `ui` (ADR `docs/adr/2026-11-09-plugins.md`, section 5; design on [HAL-1739](/HAL/issues/HAL-1739#document-design)).

- **Layer:** studio
- **Owner:** elena
- **Public API:** `@halonicjs/studio-feature-plugins` (the feature) and `@halonicjs/studio-feature-plugins/api`

## Example

```tsx
import { PluginResult } from "@halonicjs/studio-feature-plugins/api";

<PluginResult show="markdown" text={"# Today\n**Sunny**, see [the map](https://example.com)"} />;
```

`PluginResult` draws a command's or card's answer as its `show` asks (requirement `plugins.plugin-text`):

- `text`: plain text, line breaks kept.
- `markdown`: paragraphs, headings (as a bold line), bullet and numbered lists, quotes, code, **bold**, _italic_ and links to `http` or `https` pages through `ExternalLink`. A link is followed by its host in muted text, such as "(example.com)", and shows its full address on hover; an international name shows in its `xn--` form. Images, HTML and any other link stay as their own characters.
- `table`: a JSON list of objects, one per row, such as `[{"day":"Mon","high":21}]`. Anything else shows as plain text.

Nothing a plugin sends is turned into HTML or script: it is drawn as React text, and a link is only ever the kit's `ExternalLink`.

## Secrets

A plugin's `secret` setting is saved to the keychain under the plugin's own name for it, `plugin__<id>__<secret>`, never under the name the plugin declares; an empty field keeps the stored secret (requirement `plugins.plugin-secrets`). `savePluginSettings` saves nothing, secrets included, when the plugin's other settings don't fit, and `forgetPlugin` deletes every secret under those names and then the setting values when a plugin is removed. A secret that can't be saved or deleted doesn't stop the rest and is named in the result. Both live in `src/settings/plugin-secrets.ts`.

## Settings section

`PluginSettingsSection` shows a plugin's `ui.settings` on its page as label-over-field rows with the kit part for each type (requirement `plugins.plugin-settings`). A setting is saved when the person leaves its field, and a switch or a pick at once; saves run one at a time, and the page's toolbar hears each one through `onSaveState` (`saving`, `saved`, `failed`). A `secret` setting shows "Set" or "Not set" and the line "Stored in your secrets as *name*. Sent only to *hosts*.", never its value. A value that can't be saved is explained under its field (an empty required one reads "Fill this in."), a pick or a switch goes back to what is stored, and typed text stays. When settings can't be loaded, the section shows "Couldn't load the settings" with Try again. While the plugin is off (`off`), the fields stay readable and nothing is saved. The section reads and saves through a `PluginSettingsReader` and a `PluginSecretStore` that the screen passes in.

## Command dialog

`PluginCommandDialog` shows a plugin command from `ui.commands` in a dialog (requirement `plugins.plugin-commands`): the command's title, the line "From the *name* plugin · uses the tool *tool*, which reads", its form, and Cancel and Run command. A required field left empty or a value of the wrong kind gets a line under it ("Fill this in."), the first such field takes focus, and no tool is called. The tool is called through a `PluginToolCaller`; its answer shows in a Result box with Copy, drawn like `PluginResult`, and the buttons become Run again and Close. A failure reads "Couldn't run *title*: *reason*." with Try again, and the form keeps what was typed. A command without a form runs as soon as the dialog opens.

## Cards on Home

`pluginHomeCards` is Home's Cards section, which the feature adds with `studio.home.addCard` (requirement `plugins.plugin-cards`, design 8.2 and D3). It shows every card of every installed plugin from a `PluginCardFeed`, after Recent runs, two per row on desktop and one on a phone, and renders `HomeSectionEmpty` when no plugin has a card, so the section isn't there. Each `PluginCard` shows the card's title, the tool's answer drawn like `PluginResult`, and the footer "From the *name* plugin". The title and footer show at once; while the answer loads, only it has a skeleton. ↻ ("Refresh *title*") calls the tool again and keeps the old answer until the new one comes. A failure reads "Couldn't get *title*: *reason*." with Try again, and is the only thing announced. A plugin that isn't trusted or can't load keeps its cards in place, empty, with Review or Details, and calls nothing.

## Exports

- `@halonicjs/studio-feature-plugins`: `pluginsFeature`, the feature's id and title (`plugins`, "Plugins"). It is a placeholder until the shell's `defineFeature()` replaces it.
- `@halonicjs/studio-feature-plugins/api`, for other features: `PluginResult`, `PluginResultProps` (`text`, `show`) and `ResultShow` (`text`, `markdown` or `table`, from the plugin manifest's `ui`). Anything that shows a plugin's answer outside its own card or dialog draws it with `PluginResult`.

`PluginSettingsSection`, `PluginCommandDialog`, `savePluginSettings` and `forgetPlugin` are internal to the package for now: they are not exported from `index.ts` or `api.ts`.
