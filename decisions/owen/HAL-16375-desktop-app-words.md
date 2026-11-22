# Decision: "reinstall the Halonic desktop app" in the runtime-missing fix

- Approval: Paperclip task HAL-16375 (C699 rows 2, 7 and 8 from the words check of #5138, HAL-16233); small wording on an approved screen, decided by the team (HAL-2282); Liam signs this note in review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:pWstBEFfXeg6l5+DR7Ae/iH537GPE+Hn94s8Iyh25WNVjCKsDIaomT3aYHP9O+0M4NcC8RUBuSzWcoSMFzdEDA==

`runtime-missing`'s fixes in Studio said to "reinstall Halonic Studio" if
the setup still doesn't finish. The installed app is named "Halonic"
(`productName` in `tauri.conf.json`), the writing guide lists "Halonic
Studio" under Don't say, and Studio's other lines say "the desktop app". The
fix, the can't-run fix and the Settings fix now say "reinstall the Halonic
desktop app". The phone fix, added by HAL-16379, now says "open the Halonic
desktop app" and "reinstall the Halonic desktop app" where it said "Halonic
Studio". Nothing else in them changes.

The requirement changes only in this:

- `app.sandbox-start-words`: "reinstall Halonic Studio" becomes "reinstall
  the Halonic desktop app", and "open Halonic Studio" becomes "open the
  Halonic desktop app", in its text and in its two `runtime-missing` examples.

No test is removed or skipped, and no `expect` call is dropped: the words
test checks the new sentences.

The note for HAL-16233 still quotes the old words. Notes on `main` are
append-only, so it stays as it was signed, and this note records the change.

## Covers

- app.sandbox-start-words
