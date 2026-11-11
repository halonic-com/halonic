# Decision: the Ctrl K palette's empty box says Search, and place rows show their icon

- Approval: the maintainer approves this change in review of HAL-1290 (the Ctrl K follow-up from Noah's visual check of #1713)
- Kind: internal

The requirement widens two promises and narrows none: the palette's search row says "Search" while
it is empty, and a row for a place starts with the outline icon the sidebar draws for that place.
No test was weakened; one example and two tests are added.

Noah's visual check of #1713 (HAL-5335, item 1713-5) found both missing against the search frames
(T2-F6, F22): the desktop box had no placeholder, though the phone's Search sheet already says
"Search", and place rows had an empty icon slot. The icons are the kit's `PlaceIcon`, the same
drawing as the sidebar, so a place looks the same wherever it shows. Items and actions keep an
empty slot until their kinds have icons.

## Covers

- shell.palette-dialog
