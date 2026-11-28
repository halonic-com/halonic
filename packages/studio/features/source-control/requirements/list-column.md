# source-control.list-column

- Status: active
- Since: unreleased
- Source: HAL-20732; `kit.list-column` (HAL-20769); build plan HAL-20617, phase P5; `library.list-column` (the same layout)

Where the Studio shows the desktop layout, the Changes place shall show the Changes page, with its heading, sharing, changed items and History, in a list column of the kit's list-column size (`kit.list-column`), which scrolls on its own, and beside it a content pane that takes the rest of the width and scrolls on its own. Opening a row shall show that item's What changed in the content pane, with the list kept beside it, the row marked as the current one, the item's name as the pane's `h2` under the page's one `h1` "Changes", and focus on that `h2`; What changed keeps its look and has no Back to Changes there. When the open item has no changes left, as after Undo these changes, the pane shall go back to what it shows with no item open, and focus shall go to the row that took its place, or to the page's heading when no item is left. While the person chooses item by item in Get updates, the choices shall show in the content pane. With no item open, the content pane shall show the Changes place's icon, "Changes" as its `h2`, and under it the number of changed items read as the sidebar reads it ("3 changes"), or "Nothing has changed since your last version." when none changed; before a read worked, or when the folder has no history, it shall show "Changes" alone. Where the Studio shows the phone layout, Changes shall show its list alone, and What changed opens as a page of its own (`source-control.changes-phone`).

## Examples

- Given Changes in a 1280 × 800 window,
  then the list column takes the kit's list-column size (34%, at least 208px, at most 380px), and the content pane reads "Changes" and "3 changes".
- Given the person opens the row "Triage",
  then the content pane reads "Triage" as an `h2` with focus on it, the list still shows "Since your last version", and the row "Triage" is the current one.
- Given "Triage" is open and the person presses Undo these changes,
  then the pane reads "Changes" again and focus is on the row that took Triage's place.
- Given a repository with no changed file,
  then the content pane reads "Changes" and "Nothing has changed since your last version.".
- Given Changes on a phone,
  then the list fills the page, with no content pane.
