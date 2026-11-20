# Decision: the save note's action reads in accent, its "·" stays by the words, and `xs` stays 20px on touch

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-14263 (Sofia's decisions after the check of HAL-8421, building on Noah's HAL-8692 spec; a team decision with no board card, HAL-2282 rule)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:jGWVjV7obW7h2IaEQ/2bRNlPJqZy3vDnV07/cF4WvmF1xeWJDjdkTc/wsaYSlRjDVeyF46wL0l8lq+J/KtLoCA==
- Task: HAL-14263

## What changes

- **Try again** and **Compare** in the save note read in `accent-text`, on the desktop and on the phone, like the badges' "Review" and the toast's Try again. They show only on a problem, when the bar has a soft fill, so the note puts them in the kit's `OnTintContext`: a ghost button there is `accent-text` and lifts to `surface` on hover. The kit now exports `OnTintContext`.
- On the phone strip the words no longer grow to fill the row. The "·" stays right after them, as in the status bar, and the room left over falls before the action, at the right end.
- On a touch screen (`pointer: coarse`) that isn't a phone, an `xs` button stays 20px with the 48px hit area, instead of growing to 40px and sticking out of the 24px status bar with its focus ring. On a phone it still grows to 40px, inside the 48px strip.

## Why

The check of HAL-8421 found the action that saves the user's work the dimmest thing on the bar, the "·" floating mid-strip in a wide phone window, and Try again spilling out of the bar on touch laptops and tablets. `kit.button` changes its touch rule for `xs`; `shell.save-note` gains the action's colour and the "·" placement. The kit test that said `xs` grows on touch now says it stays 20px with the hit area; `sm` and `md` keep their check. New tests cover the accent action and the "·" placement.

## Covers

- kit.button
- shell.save-note
