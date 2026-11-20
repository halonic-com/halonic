# inbox.needs-you-news

- Status: active
- Since: unreleased
- Source: HAL-12458 (a11y check A8); microcopy 19.2, "Needs you goes up, outside the Inbox"

When the Needs you count goes up while the window doesn't show the Inbox, the Studio shall announce politely "Waiting for you: *title*. *N* waiting." with the new item's title and the count now. When two or more items come within 2 s of each other, it shall announce once, "*K* new in Needs you. *N* waiting." It shall leave out an item whose run's own page shows, or whose run a page that shows now has noted with `inbox.shownRuns` (such as a workflow page's docked Run panel card), since that page says it. What waits when the Inbox first loads isn't new, and a count that stays or goes down says nothing.

## Examples

- Given two items waiting and the Agents page showing,
  when a run reaches its wait step "Approve this reply?",
  then the announcer reads "Waiting for you: Approve this reply?. 3 waiting." politely.
- Given three items waiting,
  when two more come within 2 s,
  then it reads "2 new in Needs you. 5 waiting." once.
- Given the Inbox shows,
  when an item comes,
  then nothing is read; the new card takes focus there.
- Given the run `r3`'s page shows, or a workflow page that noted `r3` in `inbox.shownRuns`,
  when `r3` starts to wait,
  then nothing is read for it.
