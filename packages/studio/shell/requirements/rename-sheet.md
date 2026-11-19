# shell.rename-sheet

- Status: active
- Since: unreleased
- Source: HAL-13651; microcopy 12.3; phone layout 1.1

Where an item page on a phone has no name field, the shell's rename sheet shall show "Rename _kind_" with one field, **Name**, that starts with the item's name and has the focus, and the buttons **Rename** and **Cancel**. When **Rename** is pressed with an empty name, the sheet shall say "Give it a name." under the field, rename nothing and stay open. When **Rename** is pressed with the same name, the sheet shall close and rename nothing. Otherwise it shall rename the item to the trimmed name once and close.

## Examples

- Given the sheet for the collection "Claims", then it says "Rename collection" and Name says "Claims".
- Given Name is emptied, when **Rename** is pressed, then it says "Give it a name.", renames nothing and stays open.
- Given Name is left as "Claims", when **Rename** is pressed, then it closes and renames nothing.
- Given " Claims 2024 " typed, when **Rename** is pressed, then the item is renamed to "Claims 2024" once and the sheet closes.
