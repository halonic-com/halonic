# routines.page.review-and-make-live

- Status: draft
- Since: unreleased
- Source: HAL-15050 (the design check C529-6 of HAL-13206); microcopy 2; flow-routines 3.1 and 3.8; as `agents.page.review-and-make-live` (C508 M5, M6)

While the routine page shows "Changes not live yet" (`routines.page.frame-and-states`) and the host can make the routine live, the routines feature shall end the line in **Review and make live**, which asks the host to make the routine live. When the host answers `made`, the page shall read the routine again, since a version changes no file, and once the line goes, the routine's name shall take the focus the link had; when it answers `cancelled`, nothing changes. When it rejects, a toast shall say "Couldn't make {name} live." with the reason. Where the host can't make a routine live there is no link. On a phone the link shall sit at the right of the line, and under the words when both don't fit.

## Examples

- Given the saved Daily differs from the live version and the host can make it live, then the line reads "Changes not live yet Review and make live".
- Given that line, when **Review and make live** is pressed and a version is made, then Daily is read again, the line goes, and Daily's name has the focus.
- Given that line, when the person closes Create version without a version, then the line stays.
- Given that line, when the version can't be made, then a toast says "Couldn't make Daily live." with the reason, and the line stays.
- Given the host can't make a routine live, then the line has no link.
