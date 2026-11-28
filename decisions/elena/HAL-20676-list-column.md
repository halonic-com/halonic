# Decision: the sidebar becomes the rail's list column, and Settings moves onto the rail

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-20676 (P3 of the HAL-20617 build plan, approved by Liam on the task; the rail flows of HAL-20673, revision 2). Liam approves the change in review on HAL-20676.
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:VavlPQgnKfmgCBZHI1uX91rI5wlV9bAlmUSFdNzlgsi4PU/iM1k60BStqwbN7tUlLPNOV6jHHhyvmfzrfwBdCQ==

## What changes

`shell.sidebar-places`: where the window shows the icon rail, the sidebar leaves out the places the rail names (`shell.rail-frame`): those another rail entry holds. Everything else about the places list stays as it was.

`shell.rail-frame`: the sidebar beside the rail lists only the places the rail doesn't leave out, and keeps listening to the signals of those it leaves out, so a place shows its count as soon as it is listed again. A new example says so.

`shell.sidebar-settings`: Settings moves from the sidebar's last row to the rail's bottom, where `shell.rail` already places it. The sidebar has no Settings row of its own. It still opens on the section shown last, and the focus still goes to a page's `h1` when a section opens one. When Settings closes, the focus goes back to the rail's Settings button at every desktop width: the rail stays outside the narrow window's Places drawer, so the clause and example about giving the focus to the Places button no longer apply. The examples now name the rail.

Tests changed to follow:
- `settings-window.test.tsx` clicks the rail's Settings button, and also checks the sidebar has no Settings row;
- `settings-open-page.test.tsx` opens Settings from the rail in a 640px window and checks the focus comes back to the rail's button, or goes to the page's `h1`;
- the browser test `e2e/settings-open-page.spec.ts` opens Settings from the rail at 640px and 1280px; its Escape test, which checked the focus landed on Places in the narrow window, now checks it comes back to the rail's Settings button at both widths;
- `studio-window.test.tsx`'s two focus tests (a wide window, the narrow drawer) become one test run at 1280px and 700px, both checking the focus comes back to the rail's Settings button.

The app's tests that reached the Inbox through the sidebar's link now use the rail's Inbox, because with Home selected the column leaves the Inbox out:
- `start-studio.places.test.ts` (`studio.entry`) picks each rail entry in turn and opens every place its column lists, so it still opens every place, Home, Inbox and Library among them;
- `served-studio.test.ts` (`studio.served-inbox`, `studio.served-settings`, `studio.served-google-setup-accounts`) finds the rail's Inbox instead of the sidebar's link; the test that checks the Inbox's count picks the rail's Inbox first, then reads the count on the column's row;
- `served-wait-context.test.ts` opens the Inbox from the rail on the desktop, and from the bottom navigation on a phone, as before.

New tests: the rail opens Settings without selecting it or moving the tab; the sidebar leaves out the places the rail names and still listens to their signals. No test was skipped or weakened: each changed test checks the same thing against the rail.

## Why

The build plan's P3 replaces the sidebar's places list with the 64px rail and a list column beside it, and puts Settings at the rail's bottom. The rail, its selection and the places it leaves out landed in #6906; this change makes the window use them, so the same place no longer shows in both the rail and the sidebar.

## Covers

- shell.sidebar-places
- shell.rail-frame
- shell.sidebar-settings
