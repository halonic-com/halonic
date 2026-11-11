# Decision: a plugin may have cards without a panel

- Approval: the board's decision D3 on [HAL-1801](/HAL/issues/HAL-1801) (cards show on Home, in a
  Cards section after Recent runs); the maintainer approves this note in review on
  [HAL-5453](/HAL/issues/HAL-5453)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:8PdeuT3rf8ID3uZjKEwae13iqEPVPWPVzhvLLDTiG+F0AjcspueTyyXAcUmbwumRK3kpgWo96hm3ZpRGFNZyCw==
- Task: HAL-5453

## What changes

`format.plugin-checks` no longer fails a plugin that has `ui.cards` and no `ui.panel`. The check
`cards-need-panel` came from the plugins ADR, where cards showed only in the plugin's panel. The
board's decision D3 puts cards on Home, so a plugin with cards and no panel is valid. A new ADR,
[plugin cards on Home](../../docs/adr/2026-11-11-plugin-cards-on-home.md), records this with D2:
the panel opens in its own tab and lists the plugin's commands, then its cards, as in the approved
design on HAL-1739. It replaces the cards and panel parts of the plugins ADR (sections 1.3, 1.4 and
5), which are marked as replaced and otherwise unchanged.

## Tests

The test "fails cards without a panel, and takes commands without one" becomes two cases of
"takes … without a panel": one with only cards, one with only commands. Each expects no problem.
The old expectation of `cards-need-panel` goes, because the rule is gone; the other plugin checks
and their tests are unchanged.

## Covers

- format.plugin-checks
- packages/core/format/src/kinds/plugin/checks.test.ts
