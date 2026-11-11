# Plugin cards on Home, and the panel as a tab

- **Status:** Accepted
- **Date:** 2026-11-11
- **Deciders:** Liam (CTO); the board decided where cards and the panel go (D2
  and D3 on HAL-1801) and approved the design on HAL-1739
- **Source:** HAL-5453

## Context

The [plugins](2026-11-09-plugins.md) record showed a plugin's cards only in its
own panel, so a plugin with `cards` and no `panel` was an error
(`cards-need-panel`), and the panel listed cards, then commands. The board
then decided where plugin UI goes in Studio. D3 on HAL-1801 puts cards on
Home, and D2 opens the panel in its own tab. The approved design on HAL-1739
shows the panel with commands first, then cards. The plugins record no longer
matched any of this.

## Decision

**Cards show on Home, and in the plugin's panel when it has one.** On Home they
sit in a Cards section after Recent runs, each with "From the *name* plugin"
under it. A card calls its `read` tool with fixed arguments when it is shown.
Selection cards (`CardContribution.for`) are still not offered.

**The panel opens in its own tab, like any page.** It lists the plugin's
commands, then its cards, in manifest order.

**`panel` is optional for every plugin.** Without it, cards still show on Home
and commands in the command palette. The kind's `check` no longer has
`cards-need-panel`; its other checks are unchanged.

In the plugins record's UI table, `cards` map to Home's Cards section and the
plugin panel, and `panel` maps to a tab that draws the plugin's commands, then
its cards.

## Consequences

- A plugin author can ship cards without writing a panel.
- `format.plugin-checks` and its test in
  `packages/core/format/src/kinds/plugin/checks.test.ts` keep this true: a
  plugin with only cards, or only commands, and no panel has no problem.
- The panel isn't built yet, so no code depends on the order of commands and
  cards. Home's Cards section is still to be built.

## Changed from an earlier decision

This record replaces the parts of the [plugins](2026-11-09-plugins.md) record
about where cards show and what the panel is: the **Cards** and **The panel**
points in section 1.3, the `panel` check in section 1.4, and the `cards` and
`panel` rows of the table in section 5. Before, cards showed only in the
panel, `cards` without `panel` was an error, and the panel listed cards, then
commands. The rest of the plugins record stands.
