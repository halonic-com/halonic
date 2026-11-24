# Decision: a phone's features get the shown page's name too

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-17855 (from the Stage C visual check on HAL-17841; flow-assistant 11.1 and 11.3)
- Kind: user-visible

`shell.shown-title` said a phone, which has no tabs, gives no `shownTitle`. So on a real phone
the Assistant's status line was blank at rest, while flow-assistant 11.1 and 11.3 ask for
"Looking at: Home" there, and #5739's test passed only because it faked `shownTitle`. Now on a
phone the window gives `shownTitle` the name of the phone's own page, as its top bar shows it,
and tells a listener when the phone moves to a page with another name. The sentence changes to
say that, and the requirement gets one example. The desktop's behaviour doesn't change.

## Tests

No test is removed or weakened. `phone-shown-title.test.tsx` adds three tests: the real
`StudioWindow` at 390px opens the panel from the orb and reads "Looking at: Home", the same after
moving to More, and a listener runs only on a change of name.

## Covers

- shell.shown-title
