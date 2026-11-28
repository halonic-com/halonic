# files.code-pane-header

- Status: active
- Since: unreleased
- Source: HAL-20990 (PR 2 of 2); HAL-20742 SCREENS.md (final), "Content-pane header" and "1. Code"

Where Code's page shows a file in its content pane (`files.code-page`), the file's head (`files.ui.file-tab-header`) shall be the content-pane header: 64px high with a hairline under it, a 40px tile with 12px corners holding the file icon, then the file's name as a level-2 heading under the list column's "Code" title, with its folder in muted text on the line under it, then the ⋮ menu.

## Examples

- Given `src/checkout/orders.ts` is in Code's content pane,
  then its head shows the file tile, the heading `orders.ts` at level 2 with `src/checkout` under it, and "More actions for orders.ts".
- Given `README.md` is in Code's content pane,
  then its head shows no folder line.
