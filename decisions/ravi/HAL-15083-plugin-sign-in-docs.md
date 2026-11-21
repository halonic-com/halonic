# Decision: Remove trust and plugin remove say what they signed out

- Approval: HAL-15083, the follow-up of HAL-14850 from the C540 walk (HAL-15074); Liam approves this note in his review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:1mLnFhPDpuBGeR/YeYBUj/7waKW4hqJhP9MbhL1GK6ZX47llRD1cZ8W0z7gN7A9wb9GWRWjWfrskVFdrlJFDCA==
- Task: HAL-15083

## What changes

- **`PluginService.revoke` and `PluginService.remove`** give back each sign-in the host signed out, and whether the provider confirmed the revoke. A sign-in with no address to revoke at counts as not confirmed, as Studio's **Sign out** counts it. The sign-out itself and its order don't change.
- **`halonic trust --plugin <id> --remove`** and **`halonic plugin remove <id>`** print "✓ Signed you out of <sign-ins>." under the confirmation, and for a sign-in the provider didn't confirm, Studio's words after **Sign out**: "! You're signed out here. <name> didn't confirm, so the token may still work there until it expires." `--json` gives them as `signedOut` and `signOutNotConfirmed`. A plugin with no sign-ins prints what it printed before.
- **Docs:** `docs/guides/plugins.md`, `docs/guides/integrations.md` and `docs/security/plugins.md` no longer say a plugin can't sign in. They describe `sdk: 2`, `backend.signIns`, and that Remove trust and `plugin remove` sign the plugin out.

`plugin list` still says "not trusted yet" after Remove trust: the trust record is gone, so the list can't tell it from a plugin never trusted (reason on HAL-15083).

## Why

Before this, the CLI signed a plugin out without saying so, and when the provider didn't confirm, the person wasn't told the token may still work. Studio's **Sign out** already says both; Studio's **Remove trust** and remove don't show it yet (a follow-up on HAL-15083). The docs said sign-in wasn't supported, though `sdk: 2` sign-ins work on `main`.

## Covers

- app.plugin-sign-out
- cli.commands.trust.plugin
- cli.commands.plugin.remove
