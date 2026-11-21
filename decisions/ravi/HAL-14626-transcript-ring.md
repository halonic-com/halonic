# Decision: the chat transcript's notice sits above the scroller, so the focus ring closes

- Task: HAL-14626
- Approval: a kit detail of the approved chat parts (HAL-13177), decided by the designer on HAL-14626 (HAL-2282)
- Kind: user-visible

With a `notice`, the transcript's focus ring was open at the top: the notice was a sticky child of
the scrolling region with a surface background, so it painted over the region's inset ring (and
over the forced-colours outline), in light, dark and Windows high contrast alike (C438, HAL-14619).
The notice now sits just above the scrolling region, in the same frame, so the ring goes all the
way round the part that scrolls (WCAG 2.4.7). The region is described by the notice
(`aria-describedby` on `noticeId`), so a screen reader still reads it when the transcript takes
the focus.

The requirement drops one example: the scroll padding by the notice's height (the 57 px example
from HAL-14103). It is no longer needed, because the notice is outside the scroller and can't hide
a control scrolled into view as it takes focus; the promise behind it stays, as "the notice shall
not cover the focus ring or any message". The ResizeObserver that measured the notice goes with it.
No new words. The padding test is replaced by two tests: the notice is outside the scroller, and
the region is described by it while there is one. The other tests are unchanged except that they
find the notice beside the region rather than in it.

## Covers

- kit.chat-transcript
