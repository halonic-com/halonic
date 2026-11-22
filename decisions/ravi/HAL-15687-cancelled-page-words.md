# Decision: the cancelled sign-in page's words from words check C613

- Task: HAL-15687
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-15673#document-c613 (row 6 lists the new words; a detail of an approved page, so a team decision with no board card, HAL-2282 rule)
- Kind: user-visible

## What changes

When a plugin's sign-in was cancelled in Halonic and the person then finishes it in the browser,
the page now reads "This sign-in was cancelled in Halonic, so nothing was saved. You can close
this tab. To sign in, go back to Halonic and choose Sign in." instead of "This sign-in was
cancelled in Halonic. Start it again there to sign in."

`integration-sign-in.sign-in-flow` says the new words in its text and its example.
`integration-sign-in.sign-in-host` and `agent-host.integration-sign-in-routes` say them in their
example about Cancel. Nothing else in the three requirements changes: the page is still given only
at the cancelled sign-in's own path for the rest of its wait, nothing is exchanged or saved, and
the outcome is still `cancelled`. The tests that pinned the old words check the new ones. No
example or test was removed or weakened.

## Why

Words check C613 on HAL-15673 found that "Start it again there" points back at nothing clear. The
new words read like the two sibling pages ("…You can close this tab and go back to Halonic."), say
that nothing was saved, and name Studio's **Sign in** button.

## Covers

- integration-sign-in.sign-in-flow
- integration-sign-in.sign-in-host
- agent-host.integration-sign-in-routes
