# Decision: a wait step has no drag port, and its new arrow opens at its fields

- Approval: /HAL/issues/HAL-15586 (flow check C596, finding 4, which offered this fix; decided by the team under HAL-2282)
- Kind: user-visible
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:tPwOiASCnDnQlVwUkCGx3jPsERRgTQLbHjOXy4kwAvlq7jRFXnSoUpM8MjMX5+VUPVxXsCJO2ORIBSfNy1/vCw==

## What changes

A drop on the canvas adds an arrow on done. A wait never finishes with done: it moves on the answer a person gives (approve, reject) or on its timer. So dragging from a wait's port wrote an arrow that nothing takes, while the canvas drew it as a real path (C596 4).

- workflows.canvas.drag-to-connect: every step card that isn't an end **or a wait** has the port. The requirement says why, and points to the card's **Add** for a wait's arrows. One example is added.
- workflows.page.step-arrows: the card's **Add** on a wait expands the new row to its fields, so **On event** is right there, as it already does for a never-taken arrow. One example is added.

Nothing else in either requirement changes: the drop, its announcement and the other steps' ports stay as they were.

## Why

C596 offered two fixes: no port on a wait, or a drop on a wait that asks for the event. The first is smaller and keeps the drop a single gesture; the card already has the fields a wait's arrow needs. This builds on the approved canvas and card, so it is a team decision.

## Out of scope

Whether a wait arrow with no event shows as a problem is a core rule change, split into HAL-15590.

## Tests

No test was weakened. `connect-port.test.tsx` checks that a wait has no port; `step-arrows.test.tsx` checks that **Add** on a wait expands the new row with **On event**.

## Covers

- workflows.canvas.drag-to-connect
- workflows.page.step-arrows
