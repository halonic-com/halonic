# agents.page.review-and-make-live

- Status: draft
- Since: unreleased
- Source: HAL-14144 (after HAL-13178 and HAL-13215); flow-agents 3.1 and 3.3; the routines' "Couldn't make {name} live." (flow-routines 3.8); `source-control.create-version-elsewhere`

While the agent page shows "Changes not live yet" (`agents.page.not-live-line`) and the host can make the agent live, the agents feature shall end the line in **Review and make live**, which asks the host to make the agent live. When the host answers `made`, the page shall read the agent's live state again, since a version changes no file; when it answers `cancelled`, nothing changes. When it rejects, a toast shall say "Couldn't make {name} live." with the reason. Where the host can't make an agent live, and while the agent is live, there is no link.

## Examples

- Given the saved Sorter differs from the live version and the host can make it live, then the line reads "Changes not live yet Review and make live".
- Given that line, when **Review and make live** is pressed and a version is made, then the live state is read again and the line goes once Sorter is live.
- Given that line, when the person closes Create version without a version, then the line stays.
- Given that line, when the version can't be made, then a toast says "Couldn't make Sorter live." with the reason, and the line stays.
- Given the host can't make an agent live, then the line has no link.
