# Decision: a toolbar step connects itself to the picked step

- Approval: /HAL/issues/HAL-15137 (Sofia's decision, option A, on C544 finding 10 in Iris's flow check HAL-15101; a detail of the approved canvas toolbar, UX checklist 10.8, decided by the team under HAL-2282)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:fiwpqNAqDWTEFxairZS2EgnXyklwfUklK3aoyUFfzba8wqsXw/59cqtmvunVgrVaBj+SM4shl/zpGZEFgeiWAA==

Step and Wait put every new step right of the right-most card with no arrows, so each new step started "Can't be reached" and "Has no way out". Now, with a step picked that isn't an End, the new step goes right of it (the next free spot below when a card is there) and the picked step gets an arrow on done to it, after its other arrows, in the same undoable change. When the picked step already has an arrow on done without a condition, no arrow is added, because the first arrow that matches wins. With nothing picked, or an End picked, nothing changes. One wording fix carried over from Liam's review of #4500: a wait step with no events said "Has no events to wait for" on its card but "no answers to pick" on Configuration › Problems; the card now says "Has no answers to pick", so both say answers.

- workflows.canvas.toolbar: the sentence on where Step and Wait add a step now says the picked step rule and the arrow; the five examples from the decision are added. The other examples stay.
- workflows.configuration.problem-lines: the wait step example now names the card line too.
- studio.workspace-workflow-layout: "with no arrows" becomes "with no arrows of its own", and a sentence says when the picked step gets its arrow and that a gone picked step is refused; three examples are added. The other examples stay.

No test is weakened: two toolbar tests that checked the host was asked with three arguments now also check the fourth is `undefined` (no arrow) when nothing is picked. New tests cover the picked step's place, the End, the arrow, the chain, the exception and the refusal.

## Covers

- workflows.configuration.problem-lines
- workflows.canvas.toolbar
- studio.workspace-workflow-layout
