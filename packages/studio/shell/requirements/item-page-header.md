# shell.item-page-header

- Status: active
- Since: 0.1.0
- Source: HAL-1290 (T2); req-shell `item-page.chat-and-panel`, `panels.one-view-at-a-time` and `panels.nav-badges` (HAL-110); UX checklist part 1, 1.10 (HAL-1323); component specs 24.1 and 24.9 (HAL-175); visual review kit T7-F5 and F9 (HAL-1115)

The shell's `ItemPage` shall head an item's page with a 52px tab header that stays at the top of the page while its view scrolls: at the left the kind's 16px icon, the kind in small caps (`text-caption`, upper case, `tracking-label`, `fg-subtle`) and the name as a rename field, together the page's `h1`, then the item's ⋮ menu named "More actions for <name>" when the kind has actions; the views nav, a tab list named "<kind> views", centred; and the item's own controls at the right. The name field shall be named "<kind> name" and be as wide as the name it shows, up to the room left. When the user presses Enter in it or leaves it, the shell shall keep the trimmed name if it differs and isn't empty, and otherwise put the old one back. When the user presses Esc in it after changing the name, the shell shall put the old name back and mark that press as handled, so nothing else acts on it. The page shall show one view at a time under the header, picked in the views nav, and remember the picked view for its window tab and the item it shows, also after the tab's page was unmounted; a tab that shows the item for the first time starts on the first view. The views' badges shall come from the kit's tabs: an error count in `danger`, the count of what waits for a person in `warning`, or a still running dot, each read after the view's name.

## Examples

- Given workflow "Support reply" with views Flow, Configuration and Runs,
  when its page renders,
  then the header shows "WORKFLOW" and the name field "Support reply" in the `h1`, a tab list "Workflow views" and the page shows Flow.
- Given the name field with " Intake v2 " typed,
  when the user presses Enter,
  then the workflow is renamed "Intake v2".
- Given the name field with "Intake v2" typed,
  when the user presses Esc,
  then the field reads "Support reply" again, the press is handled, and nothing is renamed.
- Given the user picked Runs on "Support reply",
  when they open five other tabs, so its page is unmounted, and come back,
  then the page shows Runs.
