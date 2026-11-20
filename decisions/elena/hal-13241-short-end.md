# Decision: a long folder keeps at most 24 characters of its end, and More's row cuts it in the middle too

- Task: HAL-13241
- Approval: team decision under the HAL-2282 rule for a detail of approved screens, no new words (Sofia as designer, rows MC1 and MP1 of her C157 check on HAL-13229); Liam reviews the pull request on HAL-13241 and signs this note
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:i+9JzQCPjS6XnsoY472UNpof3+uEsO6d9gQFUpnX3kXpO3ujmeqMuDQeUFC75zUDxh9TBXp+XHfauz1XpvObCw==

## What changes

- The shared middle cut (`MiddleCut`) starts a folder's end at the first "/" or "\" in its last
  24 characters, instead of the last one before them, so the end is at most 24 characters and still
  starts on a whole folder name: `<home>\OneDrive - Acme BV\Documents\Acme sample`
  ends in `\Documents\Acme sample`. Only when the last name alone is longer than 24 characters does
  the end start at the separator before it (and wraps, as HAL-12907 made it). With no separator,
  the plain cut stays. The sidebar's workspace switcher and Welcome's Recent rows both use it.
- The phone's More page cuts its workspace row's folder with the same `MiddleCut`, in the row's own
  type and colour, instead of cutting it at the end. Nothing else on the row changes.

`shell.welcome-recent` says where the end starts and gains an example; `shell.more-page` says its
folder is cut in the middle. Tests whose kept end was the longer one now expect the shorter end;
no test was weakened or skipped. New tests cover the 24-character rule, a 40-character last name,
More's row, and the switcher's folder on one line in a 264px sidebar in a real browser.

## Why

Sofia's C157 check found the kept end of a usual Windows business folder 41 characters long: on
`main` it drew past the sidebar and off a 320px screen, and with HAL-12907 it took three lines.
More's row still cut its folder at the end, so the folder's own name was gone on a phone.

## Covers

- shell.welcome-recent
- shell.more-page
