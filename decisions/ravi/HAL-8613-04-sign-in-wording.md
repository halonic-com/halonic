# Decision: the plugin sign-ins take the designer's wording

- Approval: the wording is the team's decision with the designer on HAL-13419 (HAL-2282 rule); the build is HAL-8613; Liam approves this note in review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:HPoQHU6iRW9+tG4aT3G7FTEiaKCIjKY1ym34udqzNd1t6uIagQzN9q2dDbafF9468SbczvNJBTZtmymO6iRTAw==
- Task: HAL-8613

## What changes

The requirement `plugins.plugin-sign-ins` takes Sofia's wording from HAL-13419. A missing or invalid setting now reads "This sign-in needs a setting that's missing or not valid. Check Settings." in place of "Fill in this sign-in's settings first.", and a missing client secret reads "The client secret is missing. Add it in Settings." The block also no longer repeats how the last sign-in ended when **Sign in again** already gives that reason.

In the same change, without a requirement edit: the unusable answer line becomes "Halonic couldn't use *service*'s answer". The line for a setup where the callback can't arrive now says why. The status error becomes a Callout with the title "Couldn't load *name*'s sign-ins" and the reason under it, as the settings section does.

The line under a sign-in is no longer a `role="status"` paragraph made together with its text, which NVDA and VoiceOver often skip (Sofia's C422 check on HAL-14560, row SN1, decided by the team). It is plain text, and the window's announcer reads a new line once (`plugins.plugin-sign-in-announced`). The tests that found the line by its `status` role now find it by its text.

## Why

The board's approval on HAL-8619 didn't word these lines, so the team decided them with the designer. "Fill in" was wrong for an invalid setting, "Set … Set" read like a stutter, and the block said "This integration's sign-in changed since you approved it." twice.

## Covers

- plugins.plugin-sign-ins
- plugins.plugin-sign-in-announced
