# Decision: removal toasts name steps by title, and the HTTP secret line drops "for them"

- Approval: Sofia decides the words as the team on HAL-15840 (https://paperclip.halonic.com/HAL/issues/HAL-15840), from words check C637 (rows 17, 33, 34 and 35) on HAL-15824 (HAL-2282 rule: small wording on approved screens, built on microcopy 9.3 and the step names of C595-32 and C618).
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:072UJJblMNu6M+9x5yA9TjHzSJxCl+dfIGQRzzM0slnbKZtcBL6qXi0XLBs7aIgkjeX9UG+NXy+Fdvr+gkLoBg==

## What changes

- The HTTP connector's desktop line ends "Studio can't tell whether it's set." instead of
  "… whether it's set for them.", as the line for a browser behind `halonic serve` already says it.
- After removing a step or an arrow, the toast names each step as its card names it (its title,
  else its id): "Removed step Write and 3 arrows", "Removed the arrow from Sort to Approve", as
  microcopy 9.3's "Removed step Calm and 2 arrows" and as the arrow announcements, the outline
  line and the map already do.
- When Undo is refused, the toast's title names the step the same way ("Couldn't put back step
  Write") and its text gives only the cause, "The workspace changed after it was removed.". The
  desktop app's refusal used to repeat what the title says ("Step write can't be put back,
  because …"), so it now hands back only the cause.

## Tests

No test is removed or weakened. The existing toast and Undo tests now check the titles and the
cause on its own; a new test covers a refused Undo of an arrow.

## Covers

- library.http-connector-secret
- workflows.page.remove
- studio.workspace-workflow-remove
