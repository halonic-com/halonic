# Decision: Studio's Remove trust and Remove plugin say a sign-out wasn't confirmed

- Approval: HAL-15238, the follow-up of HAL-15083; Liam approves this note in his review
- Kind: user-visible

## What changes

- **Remove trust** on a plugin's page and in the plugins list shows a `warning` toast with **Sign out**'s words when a sign-in it signed out wasn't confirmed by the provider, or had no address to revoke at: "You're signed out here. <name> didn't confirm, so the token may still work there until it expires." When every sign-out was confirmed, it still shows nothing, as before.
- **Remove plugin** keeps its toast "<name> removed"; when a sign-out wasn't confirmed, the toast is a `warning` with the same line under the title.
- Several unconfirmed sign-ins read "so the tokens may still work there until they expire", as the CLI says it (HAL-15083).
- The page's `PluginActions.revoke` now gives back `PluginSignOut` (`signInsNotConfirmed`), and `remove`'s `removed` outcome carries it too. The desktop host fills it from what `PluginService.revoke` and `remove` give back (`app.plugin-sign-out`, unchanged).
- `docs/security/plugins.md` and `docs/guides/plugins.md` no longer say only the CLI tells the person.

## Why

The CLI tells the person since HAL-15083; Studio dropped what core gave back, so after **Remove trust** or **Remove plugin** a person wasn't told the token may still work at the provider. The words are the approved **Sign out** line on an approved screen, so this is a team decision, not a board card.

## Covers

- plugins.plugin-actions
