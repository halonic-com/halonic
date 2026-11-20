# Decision: a toast that Tab reached sends focus to the page's h1 when it closes

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-13402
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:1tmPS02cr7KprPamIo10qTYedaIEQkBBNBlaW12JUVr/X2cgcja/QswGhOe79yMT6Z3yal/zSKO5GrBcE60fDw==

## What changes

When the toast that has focus closes, focus still goes to the newest toast left. If there is none, it goes back to where F6 (`store.focus()`) came from, as before. What's new: when focus reached the toast some other way, by Tab or a click, or the place F6 came from is gone or hidden, focus goes to the shown page's `h1` (made focusable from code, never a Tab stop, without scrolling the page) instead of being dropped on the body. Leaving the toasts and coming back by Tab forgets where an earlier F6 came from. No words change.

The `kit.toast` requirement says so and gains one example. Nothing in it is removed or weakened, and no test is dropped or skipped.

## Why

The UX check C180 (HAL-13384) found that tabbing to a toast's Close button and pressing Enter left focus on the body, so the next Tab started again from the top of the page (WCAG 2.4.3 Focus order). It affects every toast with a Close button, and since #3796 the watch's file limit shows as a warning toast that stays until it's closed, so someone tabbing through the page will meet it. The team decided on HAL-13402 (Sofia as designer, under HAL-2282: a detail of an approved component, no new words) that focus goes to the newest toast left, else to the page's h1, as Finish and Cancel getting updates do on a phone.

## Covers

- kit.toast
