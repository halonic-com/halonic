# shell.search-page

- Status: active
- Since: 0.1.0
- Source: HAL-1290 (T2); search frames VK T2-F7 and T2-F26 (HAL-1494); microcopy 3.5 (HAL-751); C3 (HAL-991); state coverage SE (HAL-2160); `search.studio.items-by-name-or-file` (req-search, HAL-110)

The Search page shall show the title "Search", the sentence "Find anything in this workspace by its name or description.", a search box holding the place's words with a Clear button while it holds any, and a row of chips: the In and Hub pickers, then "Match case" and "Whole word". Until the engine searches the text of files, the page shall show no "Text inside" section and no "Pattern" chip. While the user types in the box, the page shall show the results for the typed words once the typing pauses for 300 ms, in the same place. When the user presses Enter in the box with other words, the shell shall show the Search page for those words as a new place in the same tab. While the providers search, the page shall say "Searching…" over still skeleton rows. When results are found, the page shall say the count, such as "2 matches in 2 items", then list them under "Names and descriptions", each with its name, kind and hub, and description, the words marked. When the user clicks a result, the shell shall open it in the tab, or with a Ctrl-click, Cmd-click or middle-click in a new tab. When nothing matches, the page shall say "Nothing matches “refund”" and "Search looks in the names and descriptions of everything in this workspace.", with a "Search all hubs" button while a hub is picked; when the user presses it, the page shall search all hubs and put focus in the box. If a search provider failed and nothing matches, then the page shall say "Couldn't search" with the reason where the Studio runs and a "Try again" button.

## Examples

- Given agent "Refund checker" described "Checks refund requests against the policy." and agent "Mail triage" described "Sorts refund mail.",
  when the user searches for `refund`,
  then the page says "2 matches in 2 items" and lists "Refund checker" then "Mail triage", with "refund" marked in each.
- Given the Search page for `refund`,
  when the user types `policy` and presses Enter, then goes Back,
  then the tab reads "Search: policy", then "Search: refund" again.
- Given the Search page for `invoice`, agent "Refund checker" and file "Refund policy",
  when the user types `ref` and pauses, then types `refund` and presses Enter,
  then both rows are listed under "2 matches in 2 items" while the tab still reads "Search: invoice", then the tab reads "Search: refund".
- Given hub "beta" is picked and nothing in it matches `refund`,
  when the user presses "Search all hubs",
  then the matches in every hub are listed and focus is in the search box.
- Given the engine isn't answering,
  when the user searches in the desktop app,
  then the page says "Couldn't search" and "The engine isn't answering. It may still be starting." with "Try again".
