# Decision: give the exact command where Studio can't list an http server's tools or check Google again

- Approval: the words are microcopy 11.4 B5 (approved on HAL-11629) and the UX check rows L7 and L8 (HAL-12363), a team decision with no new board card (HAL-2282 rule); Liam signs this note
- Kind: user-visible
- Task: HAL-12369

## What changes

- Requirement `library.listed-tools-waiting`: the page of an MCP server over HTTP says "Studio
  can't list this server's tools yet. To review them, run this in a terminal:" ("on your
  computer" on a phone) with `halonic tools review <connector id>` in a CommandBox, and offers no
  **Try again**. It sits next to the phone's "View only here." line from HAL-10084 (halonic#2876):
  that line still shows for any other connector on a phone.
- Requirement `google-setup.check-again`: where the host says it can't check yet, **Check again**
  is unavailable, with "Studio can't check these again yet. To check them, sign in again in a
  terminal:" and `halonic google sign-in <account ref>` under it.
- Requirements `studio.workspace-google-setup-accounts` and `studio.served-google-setup-accounts`:
  each host says so through a new `checkAgainEntry`. The desktop refusal for the checks becomes
  "Studio can't save this change yet.", still of kind `unavailable` as HAL-12413 (halonic#3604)
  made it, so the page shows it after its colon. Both requirements also keep HAL-12413's
  untrusted-workspace **Review** line and the host's own refusal words.

## Why

**Try again** and **Check again** always failed, and the failure line didn't say what to do. B5
was approved with a note pointing at halonic#3254, but that PR (HAL-11329) opened an http
connector's page with nothing to review instead, and never added the sentence: no commit on
`main` has ever contained it, so no later change dropped it. The page tests now check the exact
sentence on desktop and on a phone, and that the old failure line is gone. No test was weakened
or skipped.

## Covers

- library.listed-tools-waiting
- google-setup.check-again
- studio.workspace-google-setup-accounts
- studio.served-google-setup-accounts
