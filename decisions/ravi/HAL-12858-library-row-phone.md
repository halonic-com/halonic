# Decision: on a phone, a row's used-by text ends the line under its name

- Task: HAL-12858
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-12858 (a detail of the approved Library screen, so a team decision with no board card, HAL-2282 rule; Liam approves this note in review on the task)
- Kind: user-visible

## What changes

The requirement `shell.overview.used-by` said the overview page shows an item's used-by text on the
right of its row. On a phone the kit's List moves that right-hand part to the start of the line under
the name, so "Not used yet" ran straight into the description: "Not used yet When an email asks for a …".

It now says that on a phone the page ends the line under the name with the used-by text, after the
item's description and " · " ("When an email asks for a refund · Not used yet"), or gives it that line
alone when the item has no description. Chips such as "1 running" stay where they are. Desktop rows
don't change. The overview page is shared, so Agents and Workflows phone rows get the same fix.

Nothing is removed or weakened: the desktop examples stay, and two phone examples are added with a test.

## Why

On a phone the status read as part of the description and cut it off sooner. The desktop row keeps them
apart; the " · " does the same on the narrower line, as the issue suggests.

## Covers

- shell.overview.used-by
