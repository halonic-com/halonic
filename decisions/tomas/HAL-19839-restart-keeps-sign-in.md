# Decision: the click test restarts Halonic on purpose and checks the Paperclip sign-in survives

- Task: HAL-19839
- Approval: Liam approved this step as PR 2 of the plan on HAL-19832 (26 Nov); he signs this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:nUpoPYIZsBaWL+vNowdXt5+4OF9I4jCQase4D0tQnqUjYasJg0k6rmEHlom8nHKlceOwXz7rZjp5W/5x8IhuCg==

## What changes

The board's acceptance for HAL-18910 is "the sign-in survives a full restart in the installed
Windows Preview". The click test is the only place that installs the preview on Windows, so it
now checks that on every preview build.

- `studio-click-test.connections-steps`: a new step 3 in its list, "A restart keeps the sign-in",
  right after the connection row. The click test closes every Halonic process, starts Halonic
  again through the Start menu's Halonic shortcut, opens the demo, and passes when
  Settings › Connections reads Connected without Sign in again and Halonic Messenger lists the
  seeded chat rather than No connections. https only and Add another account become items 4
  and 5. Two examples are added. The reason in brackets now says the restart _used to_ sign the
  connection out (HAL-19027), since #6594 fixed that and this step checks it.
- `studio-click-test.paperclip-steps`: only the step numbers move, 8 to 13 become 9 to 14 (the
  sentence and the examples). What each step checks is unchanged.
- The runner gets `restartsFirst` on a step: it restarts the app before that step, the same way
  it does after a failing step. If the app doesn't start again, the step fails as `NO_RESTART`
  and the rest are "not run".

The step goes after step 5 because only step 3's connection exists there. After Add another
account a second, disconnected connection is listed, which would blur what the step reads.

## Tests

No test was weakened, skipped or deleted. Three expectations follow the new step's place:

- `src/steps-connections.test.ts`: the Connections steps' order now includes
  `restart-keeps-sign-in` after `connection-row` (6 ids instead of 5).
- `src/basics-steps.test.ts`: the basics are steps 15 to 17, so the slice moves by one.
- `src/affected.test.ts`: a change to `packages/studio/services/requirements/paperclip-connect.md`
  now also runs the restart step, whose `services.paperclip-restore` lives in that package.

New: `src/steps/restart-sign-in.test.ts` checks the step passes on a connected row and a Messenger
that lists the chat, fails as `SIGN_IN_AGAIN_SHOWN` and `NO_CONNECTIONS`, and that the runner
restarts before a `restartsFirst` step and fails it as `NO_RESTART` when the app won't start.

## Covers

- studio-click-test.connections-steps
- studio-click-test.paperclip-steps
