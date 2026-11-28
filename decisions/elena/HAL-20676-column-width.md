# Decision: the list column takes 34% of the window, at most 380px, and the rail's `nav` is named "Apps"

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-20676 (P3 of the HAL-20617 build plan, approved by Liam on the task: "the list column is about 34% of the window, at most 380 px"; Liam's review of #6908 asked for one of the two `nav`s named "Places" to be renamed). Liam approves the change in review on HAL-20676.
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:TrCYZbZErA7WnPxNUj1z/y54KXGjpPy4OQIlf+MW4UaTKvPHcHsIZR75/8TcX2Z+eUwL9YIUTlyenXcxLPyRDA==

## What changes

`shell.sidebar-resize`: where the window shows the icon rail, the sidebar, now the rail's list column, is 34% of the window wide, kept inside 180 to 380px. It follows the window as it resizes until the person sets a width with the edge. The edge's maximum goes from 640 to 380px, so **End** and a drag stop at 380. **Enter** and a double-click give the column the window's width back, after which it follows the window again; a sidebar with no window around it still goes back to 264px. The narrow window's Places drawer stays 264px. The examples follow the new limits, and two new ones cover following the window and keeping a width the person set.

`shell.rail`: the rail's `nav` is named "Apps" rather than "Places", so a screen reader's landmark list tells it apart from the sidebar's "Places". The name waits on a copy check (child task of HAL-20676).

Tests changed to follow:
- `sidebar-resize-edge.test.tsx`: the maximum, End, the stop at the end and the drag now expect 380 where they expected 640; the Home, End, Enter test starts at 300px, inside the new limits;
- the rail's Settings and Inbox are found under the `nav` named "Apps" in `settings-window.test.tsx`, `settings-open-page.test.tsx`, `studio-window.test.tsx`, `icon-rail.test.tsx`, `e2e/settings-open-page.spec.ts` and the app's `served-studio.test.ts`, `served-wait-context.test.ts` and `start-studio.places.test.ts`. What each checks is unchanged. The installed-app click test (`packages/testing/studio-click-test`, `placesList`) looks for a place in the `nav` named "Places" or "Apps", so its steps still find Home, the Inbox and Settings on the rail.

New tests (`column-width.test.tsx`): 34% of the window inside 180 to 380px; the column follows the window; a width the person set stays until the edge resets it. No test was skipped or weakened.

## Why

The build plan's P3 sets the list column beside the rail at about 34% of the window, at most 380px. Liam's review of #6908 found two landmarks with the same name, which a screen reader's landmark list can't tell apart.

## Covers

- shell.sidebar-resize
- shell.rail
