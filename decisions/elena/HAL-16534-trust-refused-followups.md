# Decision: Trust waits a moment after a refusal; the wait line says where to trust; no Try again over unsaved changes

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-16534 (from visual check C720 on HAL-16532, rows 1 to 3; Liam reviews the trust changes)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:we6JRmzB/c5Z69shXrdQAeXuofb1PW9HSt4+69X9WbrLQ5QQAt5kodi76oZiC6zdiJ9njoa9Mq4gk17JwL10CA==

**A double click on Trust.** Since #5279, **Trust** refused because the workspace changed under the
open dialog moves focus to **Not now**, which stops a double Enter. A double click still trusted the
new check unread: the second click lands on **Trust** wherever focus went. Now **Trust** stays
unavailable for 1 second after that refusal, longer than a double click, with the notice "This
workspace changed while you were reviewing it. Check the new version." as its reason; after that
the next **Trust** saves the new check, as before. The requirement `workspace.trust-badge` says so,
with an example. The test "saves nothing for a check that changed after it was shown, and saves the
new one next" pressed **Trust** again at once; it now lets the second pass first, which is the new
behaviour, and still checks that the new check is saved. A new test clicks twice at once, again
just before the second ends and once after it; it fails on the old code. No test was weakened.

**The line in Check's place.** "You can check this address once you trust this workspace." didn't
say where to trust, and showed even when the workspace can't be trusted at all. It now says "Trust
this workspace to check this address: press Review in the header." (the header badge reads "Not
trusted yet · Review"), and there is no line when the workspace can't be trusted at all, since it
would send the person to a trust that can't happen. Small wording on an approved screen, decided by
the team (HAL-2282). The draft requirement `models.providers.check` says so; the UI test's expected
words changed with it, and a new test covers the workspace that can't be trusted.

**Get updates over changes not in a version.** "Updates would overwrite changes you haven't put in
a version. Create a version first." kept Try again, which is refused the same way until the person
creates a version. Like the refusal over a file Halonic leaves to git (#5275), it is now a
`conflict`, and its toast has no Try again; the words are unchanged and already say what to do.
Since #5301 (HAL-16504) the left-to-git refusal's toast has Show how, which opens the how-to for
files left to git; that how-to doesn't fit this refusal, so its toast has no action at all. The
`refused` outcome carries `leftToGit` to tell the two apart.
Both ways to get updates (bringing in newer versions, and choosing item by item) do this. The
requirements `source-control.get-updates` and `source-control.get-updates-per-item` say so; new
tests check the kind on both ways and the toast with no Try again.

## Covers

- workspace.trust-badge
- models.providers.check
- source-control.get-updates
- source-control.get-updates-per-item
- packages/studio/features/workspace/src/trust/trust-check-changed.test.tsx
- packages/studio/features/models/src/providers/provider-check.test.tsx
