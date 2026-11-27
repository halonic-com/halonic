# Decision: a risky approve from the page waits for the shell's own confirmation

- Approval: /HAL/issues/HAL-20278 (plan approved by Liam, PR 4; 6.8 decided on HAL-20274, Julian's additions on HAL-20278; stack B on HAL-20441)
- Kind: user-visible

Condition 2 of section 6.8 of the HAL-17491 note: a page script can't
approve a hire, a secret or any other risky item without the person's
click. The agent host refuses such an answer on the page's route, and
Studio's shell asks in its own dialog, built from the host's copy, before it
sends the answer on a route only the shell can name
(`agent-host.risky-answer-confirm`, `studio.src-tauri.risky-answer-confirm`).

- `agent-host.messaging-answer-route` said the host passes on every answer
  the port takes. It now names the exception, an approve of a risky item,
  and passes on answers to items the workspace lists: the host reads the
  item again for its risk, so an item it no longer lists is refused with
  `not-found` rather than sent unchecked. Its tests now list the card they
  answer; every `expect` stays as it was.

The user sees a new confirmation window when they approve a risky item in
Studio desktop. Rejects and normal items go through as before.

## Covers

- agent-host.messaging-answer-route
