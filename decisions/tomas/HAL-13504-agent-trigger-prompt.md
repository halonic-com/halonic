# Decision: Add trigger on an agent writes the routine only with the prompt the person typed

- Approval: follow-up to HAL-13498, found in its fix; same wording as HAL-13498 (the HAL-12401 team decision, Sofia's N1 to N7 on HAL-12363) under the HAL-2282 rule; the reviewer (Liam) approves this note in review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:vQp5EYkS1AkzsgyHTGJjyYCh2mTXmOHb9eEjbqwRmMfIpgUZv1up+/QuWg6PQ8Xyn/TDTiE+bpb5MZFlBTjxCQ==
- Task: HAL-13504

## What changes

`studio.workspace-routines`: the requirement now says what a Triggers section gets from the host,
which it did before without saying so: the routines that start the owner, and a new manual routine
from **Add trigger**. Add trigger on an agent starts it with the prompt the person typed, no longer
with "Describe what to do.". Made without a prompt, it is refused with "Say what *Name* should do."
and nothing is written. One example is added for Add trigger; no example is removed or weakened.

The draft requirement `routines.triggers.add-trigger-creates-routine`: on an agent, Add trigger
first shows a **Prompt** in the section, empty and focused, with "Describe what to do." as its hint,
"Say what *Name* should do." under it, and **Add trigger** and **Cancel**. A workflow's Add trigger
is unchanged.

## Why

"Describe what to do." reads like a hint, but Add trigger saved it as the agent's real task, so Run
now sent the agent that text as its whole job: the problem HAL-12401 fixed in the Starts card and
HAL-13498 in the New routine dialog. A routine file needs a non-empty prompt, so the section asks for
it before the file exists, with the same field as the New routine dialog.

## Covers

- studio.workspace-routines
