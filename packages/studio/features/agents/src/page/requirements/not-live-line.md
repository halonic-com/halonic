# agents.page.not-live-line

- Status: draft
- Since: unreleased
- Source: HAL-13178 (T6); flow-agents 3.1 and 3.3; microcopy 2 ("Changes not live yet", revision 78); save model 2.4; core's `app.live-state` (HAL-3246)

While the agent's saved file isn't in the live version, the agents feature shall show the quiet line "Changes not live yet" under the agent page's header, read again when a file changes; that is when the live state is `not-live`, or `never-versioned` because no version has the agent yet. While the agent is live, where the host can't tell its live state, and when the live state can't be read, the page shall show no line. The line has no **Review and make live** link until another feature can open Create version for one item.

## Examples

- Given the saved Sorter differs from the live version, then the page says "Changes not live yet" under the header.
- Given no version has Sorter yet, then the page says "Changes not live yet".
- Given Sorter is live, or the host has no live state, or reading it fails, then there is no line.
- Given Sorter is live, when a change to its file is saved, then the line shows once the live state says `not-live`.
