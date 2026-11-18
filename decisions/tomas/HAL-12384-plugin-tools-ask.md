# Decision: the CLI's plugin trust check says every tool asks first, as Studio's does

- Task: HAL-12384
- Approval: Liam approves this change in review on HAL-12384 (https://paperclip.halonic.com/HAL/issues/HAL-12384). A team decision with no board card (HAL-2282 rule): the line is Studio's approved T8 wording, now shown in the CLI too.
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:7Z5CKA+8TM/Ncc+eVEOOdPCkj40L1CB2XwKz2ETWhPjlRFXg1C0jIrA5EenKUD7t30z4fzEzNjAuFBVJQAasBA==

## What changes

`halonic plugin add` and `halonic trust --plugin` showed "· asks a person first" only after a tool
that changes things or sends, so a tool under **Reads** looked as if it ran without asking. That
isn't what happens: a plugin's tools reach agents through a connector, and the engine counts every
connector tool as `write` until the connector file's `read` list names it (HAL-5583,
`countedRisk`), whatever risk the plugin gives it. Studio's trust check already said so.

The sentence "Agents can use these through a connector. Each one asks a person first unless you
change that." now lives in `@halonicjs/app` as `pluginTrustToolsIntro`. Studio reads it from there
and the CLI shows it as the first line under Tools for agents, without the marker after each tool.

The requirements `app.plugin-trust-sections` and `cli.commands.plugin.add` say this. The CLI tests
that expected the marker now expect the line instead; a core test pins the sentence. No test was
weakened or skipped. `docs/guides/plugins.md` and `docs/security/plugins.md` are corrected to match.

## Why

Found in Nina's docs check on HAL-12361: the two checks disagreed, and in HAL-12334 a connector's
read tool did wait for approval, as the engine says.

## Covers

- app.plugin-trust-sections
- cli.commands.plugin.add
- apps/cli/src/commands/plugin/add.test.ts
- apps/cli/src/commands/trust/plugin.test.ts
- apps/cli/src/messages/plugin.test.ts
