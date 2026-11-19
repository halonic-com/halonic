# Decision: on a phone, What changed and a version page are pages on the More stack, with one Back

- Task: HAL-12860
- Approval: team decision under the HAL-2282 rule for a detail of approved screens (the phone's Changes, What changed and version pages, and the approved `shell.place-stacks` rule); Liam reviews the pull request on HAL-12860 and signs this note
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:qa57ORFh2WBFmMQYybEWaZKiWCqa70MGxHTx9jRy6jVee8L1Q+5wL4elrIbX5jjQMc+i1KxsUjzCzAtlkrisBg==

## What changes

On a phone, More › Changes › an item opens What changed as a page of its own on the More stack, as Library's kind lists already are. The top bar names the item ("Reply writer"), and its Back, and Android's back, return to the Changes list. The page's own **Back to Changes** goes; the desktop keeps it. The page's heading stays for screen readers and still takes focus, as the Changes page's own heading does under its top bar.

A version in History works the same way: the top bar names the version, its Back returns to the Changes page, and **Back to History** goes.

Kept as approved: focus goes back to the row the page was opened from (a version's row unfolds all of History when it is past the newest 5), **Undo these changes** still closes the page with the same toast and focus on the row that took its place, and the list is scrolled where it was.

For this the shell gains, in `shell.studio-phone`:

- `openPlacePage(place, sub, title)`: a place's view pushes a page that is no list (the bottom navigation hides, as on any opened item), with Back to the page it came from;
- `closePlacePage(place, sub)`: the view closes that page, as after Undo, and nothing moves once the user has left it;
- a memory for each page on a stack (`PlaceViewProps.memory`): the page's scroll, which the window puts back after Back, and the row the view noted before pushing a page.

The scroll is kept for every page the phone draws again after Back, so a place's list, such as the Inbox's or a Library kind's, is also where the user left it rather than wherever the page above it was scrolled. A page shown for the first time is left as before.

The requirements change:

- `shell.studio-phone` gains the three behaviours above and three examples.
- `source-control.whats-changed-phone` gains the page on the stack, the top bar's name and Back, the heading for screen readers and one example; the roll-back warning is now "the first thing on the page" instead of "the first thing under Back to Changes".
- `source-control.changes-phone` (2.14) replaces "with Back to History" by the top bar's name and Back, and its example presses the top bar's Back. Its sentence for a version a later read no longer has (from HAL-1302) now says the version's page leaves the stack, so the Changes page shows again and stays when the version comes back; its example is unchanged.

Tests changed with them: the phone's version tests press the top bar's Back instead of Back to History and check the top bar's name, and the test for a version a later read no longer has also checks the top bar's name; the rest of What changed's phone tests run on a test stack with a top bar. Each still checks what it checked before. No test was skipped or removed.

## Why

Kim found in HAL-12855 (C86) that a phone showed two backs that went to different places: the top bar still said "Changes", and its Back (and Android's) went to More, skipping the Changes list, while the page's own **Back to Changes** went to the list. Both pages were local state inside the Changes view, not pages on the phone's stack, so they broke `shell.place-stacks` ("Back shall go one page up in the place's stack"). Deleting Back to Changes alone would have left only a Back that skips the list. As pages on the stack, there is one Back, in the place every other phone page has it, and it goes one page up.

## Covers

- shell.studio-phone
- source-control.whats-changed-phone
- source-control.changes-phone
