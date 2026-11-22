# Decision: an unconfirmed sign-out says how to end the token, and a repeated outcome ends the wait

- Task: HAL-15807, with HAL-15814 bundled in
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-15807 (from flow check C634 on HAL-15803, items 3 and 7; the words are a detail of an approved screen, decided with Sofia on HAL-15819, HAL-2282 rule); the toast title from words check C633 on HAL-15814
- Kind: user-visible

## What changes

When the provider doesn't confirm a sign-out, the line now says "The provider didn't confirm"
instead of naming the plugin, and adds "To end it now, remove the access you gave in your account
settings at the provider." After **Remove trust** or **Remove plugin**, Studio's toast names the
sign-ins ("You're signed out of weather-account here. …"), as the CLI already does. The CLI's `!`
line, the line under a sign-in's own block after **Sign out**, and the guide use the same words.

The host now counts each sign-in's outcomes (`outcomeCount`, next to `lastOutcome` in the status),
and Studio's block counts a new count as a change. A sign-in cancelled in the browser twice in a
row used to keep the block waiting until **Cancel** or the 10-minute timeout; now it ends the wait.

Requirements: `plugins.plugin-actions`, `plugins.plugin-sign-in-text`, `plugins.plugin-sign-ins`
and `cli.commands.trust.plugin` change the quoted line and say the new step;
`integration-sign-in.sign-in-host` and `agent-host-client.integration-sign-in` say the status
carries the count, each with one new or extended example; `plugins.plugin-sign-in-waiting` says a
repeated outcome ends the wait, with a new example. `plugins.plugin-actions` also says the
"*name* removed." title ends in a full stop when a warning is under it (words check C633, row 3,
microcopy 1.3). No example or test was removed or weakened.
The tests that pinned the old words check the new ones.

## Why

C634 found that after **Remove trust** or **Remove plugin** Studio has no button left to retry,
and the line gave no next step. The plugin's name isn't the service the token is for. A cancel
outcome carries no time, so a second one in a row looked unchanged to the block (confirmed by the
new test in `plugin-sign-in-waiting.test.tsx`, which failed before the fix).

## Covers

- plugins.plugin-actions
- plugins.plugin-sign-in-text
- plugins.plugin-sign-ins
- plugins.plugin-sign-in-waiting
- cli.commands.trust.plugin
- integration-sign-in.sign-in-host
- agent-host-client.integration-sign-in
