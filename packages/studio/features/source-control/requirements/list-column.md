# source-control.list-column

- Status: active
- Since: unreleased
- Source: HAL-20732; `kit.list-column` (HAL-20769); build plan HAL-20617, phase P5; `library.list-column` (the same layout)

Where the Studio shows the desktop layout, the Changes place shall show the Changes page, with its heading, sharing, changed items and History, in a list column of the kit's list-column size (`kit.list-column`), which scrolls on its own and whose header lets Get updates go under "Changes" when both don't fit on one line, and beside it a content pane that takes the rest of the width and scrolls on its own. The content pane shall show one thing at a time, and the list shall mark the row of what it shows as the current one.

- Opening a changed item's row shall show that item's What changed in the content pane, with the item's name as the pane's `h2` under the page's one `h1` "Changes" and focus on it. What changed keeps its look there and has no Back to Changes.
- Picking a version in History shall show its details in the content pane (`source-control.history-page`), with its name as the pane's `h2` and focus on it. Escape there shall put focus back on the version's row.
- While the person chooses item by item in Get updates, the choices shall show in the content pane, in place of an open item or version, which closes. Opening a row or a version while the choices show shall put them aside with the merge still started, as a phone's Back does: the list then says "You're in the middle of getting Sam's updates." with Continue, which brings the choices back to the pane.
- When the open item has no changes left, the content pane shall go back to what it shows with nothing open. Focus shall move only if it fell to the page with What changed, as after Undo these changes in the pane: then to the row that took the item's place, or to the page's heading when no item is left. Focus elsewhere, as on Get updates when a read nobody asked for finds the item gone, shall stay where it is.
- With nothing open, the content pane shall show the Changes place's icon and "Changes" as its `h2`. Under it, for a repository it read, the number of changed items as the list counts them ("3 items"), or "Nothing has changed since your last version." when none changed. Before a read worked, and for a folder without history, a computer without git or a folder inside a larger repository, "Changes" shall stand alone.

Where the Studio shows the phone layout, Changes shall show its list alone, and What changed, a version and the choices open as pages of their own (`source-control.changes-phone`).

## Examples

- Given Changes in a 1280 × 800 window with 3 changed items,
  then the list column takes the kit's list-column size (34%, at least 208px, at most 380px), and the content pane reads "Changes" and "3 items".
- Given the person opens the row "Triage",
  then the content pane reads "Triage" as an `h2` with focus on it, the list still shows "Since your last version", and the row "Triage" is the current one.
- Given "Triage" is open and the person picks "Sorter replies in Dutch" in History,
  then the pane shows that version with focus on its name, and only its row is current.
- Given "Triage" is open and the person presses Undo these changes,
  then the pane reads "Changes" again and focus is on the row that took Triage's place.
- Given "Triage" is open, focus is on Get updates, and the window comes to the front after Triage was changed back elsewhere,
  then the pane reads "Changes" again and focus stays on Get updates.
- Given Get updates' choices show and the person opens the row "Triage",
  then the pane shows Triage, and the list says "You're in the middle of getting Sam's updates." with Continue.
- Given a folder without history,
  then the content pane reads "Changes" alone.
- Given Changes on a phone,
  then the list fills the page, with no content pane.
