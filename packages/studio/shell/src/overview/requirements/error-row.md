# shell.overview.error-row

- Status: active
- Since: unreleased
- Source: HAL-14902 (part 1 of HAL-14370); C348 on HAL-14317, ST4

Where a feature marks an item as an error, with a chip and a reason in its own words, the overview page shall draw the item's row in the kit list's error state: the chip in a danger chip with its dot in place of the item's chips, and the reason in danger text in place of its detail. The search shall still match the item by its name, id, description or detail.

## Examples

- Given the item "writer.agent.yaml" marked as an error with the chip "1 problem" and the reason "Line 2: A value has ": " in it.",
  when the page shows,
  then its row shows the name, "1 problem" in a danger chip and the reason in danger text.
- Given that item with the description "writer.agent.yaml",
  when the search is "writer.agent",
  then the row still shows.
