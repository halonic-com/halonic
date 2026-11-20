# Decision: keep the open page when the window crosses the phone width

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-13726, decided by the team (Sofia) as a fallback of approved screens, with no board card (HAL-2282 rule).
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:jwrxJQb/tYBYuN9D+hZj7n4Oyn5OIRoUgbYX9lEESIlHq7Q0+vNb2wt34r7TqDu+C13MhklAJud5cGPRyHfcBw==

## What changes

Before, the desktop's tabs and the phone's places were kept apart, so a window that crossed the
phone width (600px) showed whatever the other layout had last: a run open at 1280px became Home
at 390px, and the focus was lost. Now the page that's open stays open, either way, with the focus
on its title:

- Narrowed, the phone shows the active tab's page where it lives, so **Back** leads to the place
  that lists it (or Home).
- Widened, the active tab shows the phone's page, or the tab that already shows it becomes active.
- A page with no version in the new layout opens its parent: a list a place pushed opens the
  place, and Settings' list or a section opens the Settings dialog on it. More has no desktop
  page; the sidebar does its work, so the desktop keeps the tab it had.

The requirement `shell.studio-phone` is updated to say this, with examples for each case. The
test "comes back to where each layout was when the width crosses the phone's" checked the old
behaviour; it now checks only the More case that still holds ("keeps the desktop's tab when the
phone was on More"), and its last step (narrowing again shows More) is dropped, because narrowing
now shows the desktop's page. The window-title test "names the phone's page on a phone, and the
active tab's again on the desktop" narrowed with a run open and expected Home; it now goes to More
from Home, checks that widening keeps the desktop's tab, then checks that narrowing with a run
open names the run. New tests in `layout-crossing.test.tsx` cover the rest. No test was
skipped.

## Why

Found in the C217 check (HAL-13691): someone who narrows the window, or snaps it to a third of
the screen, lost their place and the keyboard focus.

## Covers

- shell.studio-phone
- packages/studio/shell/src/window/studio-phone.test.tsx
- packages/studio/shell/src/window/window-title.test.tsx
