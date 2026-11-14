# shell.overview.states

- Status: active
- Since: 0.1.0
- Source: HAL-1303 (T10, P1); state coverage rows LB (HAL-2160); UX checklist section 0

The overview page shall show, in place of its sections and using the words the feature passes in, one of these states: the failed state with a Try again button when the items couldn't load, skeleton rows named for screen readers while they load, "nothing yet" when there is no hub and nothing shared, and a no-match line naming the search text when the search finds nothing. It shall keep the search field in every state but the failed one.

## Examples

- Given the items failed to load with "Couldn't load skills",
  when the page shows,
  then it shows that title and Try again, and pressing Try again calls the feature's retry.
- Given no hub and nothing shared,
  when the page shows,
  then it shows the feature's "No skills yet" and no section.
- Given skills "summarise" and "draft-reply",
  when the user types "zzz",
  then the page shows "No results for “zzz”" and no section.
- Given the items are loading,
  when the page shows,
  then screen readers hear "Loading skills".
