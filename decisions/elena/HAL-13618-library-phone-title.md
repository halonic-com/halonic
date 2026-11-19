# Decision: under a phone's top bar, a Library item page's title is for screen readers only

- Task: HAL-13618
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-13618 (decided by the team under HAL-2282, Sofia as designer; follows the approved phone layout 1.1, Back · name · ⋮)
- Kind: user-visible

The phone's top bar already names a skill, knowledge source or connector, so the page's own `h1` no
longer repeats it in the title size: it is `sr-only` there and keeps `tabIndex={-1}`, so Undo and
opening the page can still focus it, as on the agent page. The desktop is unchanged. A collection's
title is its rename field, the only place to rename it, so it stays on screen. The requirement
`library.library-phone` says this and gets an example for a skill page. No new words, and no test was
weakened.

## Covers

- library.library-phone
