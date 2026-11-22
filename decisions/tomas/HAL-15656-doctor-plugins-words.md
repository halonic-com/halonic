# Decision: the doctor's Plugins line says what a missing plugin costs and ends every problem with a fix

- Task: HAL-15656
- Approval: the team decides this on HAL-15656 (https://paperclip.halonic.com/HAL/issues/HAL-15656), from rows 2, 4 and 7 of Nina's C609 words check on HAL-15652. It refines CLI words that already exist: a team decision with no board card (HAL-2282 rule).
- Kind: user-visible

## What changes

- A plugin that isn't added: "orders uses the plugin acme-order, which isn't added, so orders has no
  tools yet." It says what it costs, as `halonic tools review` does for the same plugin.
- With a near id, "Did you mean acme-orders?" is followed by a fix: "Fix: change the plugin id in
  orders.connector.yaml to acme-orders, or add acme-order with halonic plugin add <folder or git
  address>, then run halonic doctor again." Without a near id the fix is unchanged.
- A plugin that can't be read or checked: the doctor says "maps can't be read or checked, so it's
  off." with "Fix: remove it with halonic plugin remove maps, then add a version that works.", and
  `tools review` and `tools approve` say the same in one line. Before, both pointed at
  `halonic plugin list`, which shows only "✕ can't be read or checked" for that plugin.

The requirements `words.doctor-plugins` and `cli.commands.tools.plugin-connector` say this now, and
their tests expect the new words. No test was weakened or skipped.

## Why

C609 found that the not-added line fails the doctor without saying why that matters, that a near id
left the person without a next step, and that "See halonic plugin list." led nowhere.

## Covers

- words.doctor-plugins
- cli.commands.tools.plugin-connector
- packages/core/words/src/doctor-lines.plugins.test.ts
- apps/cli/src/commands/tools/plugin-connector.test.ts
