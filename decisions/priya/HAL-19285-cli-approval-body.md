# Decision: first-run hints in the command line (0.1.1 walk-through)

- Approval: wording for A, B and C decided by the team on HAL-19285 (Sofia, building on the approved run view); D's way in decided by Liam on HAL-19285, its strings checked by Sofia
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:G+BtnQ3RPHzIylJCOC+TbrWcZ5OZXXFnbD13AWP55DaTouetMnFbdxKF0au7SvR6eOJVaisULDsmhsUYbaD1Ag==
- Task: HAL-19285

Two requirements change their words, and goldens change with them. Nothing they already
required is dropped.

## Covers

- `cli.commands.init.create-workspace`
- `cli.commands.serve.npm-package-page`

## What changes

- `cli.commands.init.create-workspace`: the fix for a folder that isn't empty now gives an example
  name: "Pick a new folder name, for example halonic init my-workspace, or run it in an empty folder."
- `cli.commands.serve.npm-package-page`: the line under "Serving" now names the way in for an npm
  user, the Halonic app for Android and `halonic serve pair`; without `--network` or
  `--public-origin` it says to serve with `halonic serve --network` first, since a phone can't
  reach `localhost`. A a browser's `GET /` with `Accept: text/html`
  gets a plain HTML page with that line instead of the JSON 404. Every other path and every
  request that doesn't ask for HTML gets the same answer as before.
- The `run` waiting golden (`support-reply-waiting.txt`) and the `runs show` waiting test now show
  the wait's body under "! Waiting for you", so the person reads what they approve.

## Why

Sofia's walk-through of the released 0.1.1 first run (HAL-19280) found a new user approving a
reply they never saw, a `halonic init` fix without an example, and an npm user's browser showing
raw JSON at the address `serve` printed. The Android app is attached to the 0.1.1 GitHub release,
so it is a way in an npm user can take today.
