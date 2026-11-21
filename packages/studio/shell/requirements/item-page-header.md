# shell.item-page-header

- Status: active
- Since: 0.1.0
- Source: HAL-1290 (T2); req-shell `item-page.chat-and-panel`, `panels.one-view-at-a-time` and `panels.nav-badges` (HAL-110); UX checklist part 1, 1.10 (HAL-1323); component specs 24.1 and 24.9 (HAL-175); visual review kit T7-F5 and F9 (HAL-1115); HAL-13177 (the agent page's title focus and its line under the header); HAL-12216 (the name checked as it is typed, UX checklist 10.2; read out, wrapped and in the heading's type, C434 RN1 to RN3); UX check C505-5 (HAL-14915, a view the page shows)

The shell's `ItemPage` shall head an item's page with a 52px tab header that stays at the top of the page while its view scrolls: at the left the kind's 16px icon, the kind in small caps (`text-label`, upper case, `fg-subtle`) and the name as a rename field, together the page's `h1`, then the item's ⋮ menu named "More actions for <name>" when the kind has actions; the views nav, a tab list named "<kind> views", centred; and the item's own controls at the right. The name field shall be named "<kind> name" and be as wide as the name it shows, up to the room left. When the user presses Enter in it or leaves it, the shell shall keep the trimmed name if it differs and isn't empty, and otherwise put the old one back. When the user presses Esc in it after changing the name, the shell shall put the old name back and mark that press as handled, so nothing else acts on it. The name field shall take its type from the heading it sits in. Where the page checks names (`NameField`'s `check`), the shell shall show why a new name can't be kept under the field once the typing pauses, tied to the field as its description, wrapped before the window's edge, and read out once through the window's announcer, since a screen reader doesn't read a description again when it changes under focus; and it shall not keep that name: Enter leaves it in the field, shows the reason at once if it isn't shown yet and reads it again, and leaving the field puts the old one back and announces "Name not changed: <the reason>". The `h1` shall take the focus when the page moves it there, such as after **Try again** has read the item. A line the page gives (`notice`), such as "Changes not live yet", shall show across the tab right under the header. The page shall show one view at a time under the header, picked in the views nav, and remember the picked view for its window tab and the item it shows, also after the tab's page was unmounted; a tab that shows the item for the first time starts on the page's first view (`firstView`, else the first in the nav). When the page shows a view itself (`show`), such as from a link in its chat, the shell shall remember it as if the user had picked it, reopen a panel the user closed, open the panel's own screen in a narrow tab, and move focus to the element the page names or else to the panel, so focus never lands on something hidden. The views' badges shall come from the kit's tabs: an error count in `danger`, the count of what waits for a person in `warning`, or a still running dot, each read after the view's name.

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
- Given another workflow is called "Mail triage",
  when the user types "Mail triage" in the name field,
  then "A workflow called Mail triage already exists." shows under it as its description, Enter keeps the typed name in the field without renaming, and leaving the field puts "Support reply" back.
- Given another workflow is called "Mail triage" and the user typed "Mail triage" in the name field,
  when the typing pauses,
  then "Workflow name: A workflow called Mail triage already exists." is announced once; Enter announces it again, and leaving the field announces "Name not changed: A workflow called Mail triage already exists."
- Given an agent page whose Configuration panel the user closed with ✕,
  when the chat's Open Harness settings › shows Configuration,
  then the panel is back beside the chat on Configuration, with focus in it.
