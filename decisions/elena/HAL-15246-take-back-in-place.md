# Decision: Take back says its result in place in the Settings dialog

- Task: HAL-15246, from the design check C551 (HAL-15217, points U2, U3 and U5)
- Approval: the designer's decision on HAL-15246, within the board-approved R16 (HAL-2282); Liam signs in the review of HAL-15246
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:f/DY/RtS3Q2wuIe4e7iVyPUevuRVIJoVHpBYZ3DyfGmUkqkGSLibHvrv/bi8hfC56uBV3XZ3pZUtEnbzgj0pBw==

## What changes

- `settings.unfenced-yes-take-back`: in the Settings dialog, the result of **Take back** shows in place and goes through the Settings live region, not as a toast: "Taken back. …" as a quiet line under the heading, and "Couldn't take it back: *reason*" as a danger line under **Take back**, with the focus kept there. The phone's Settings page keeps the toasts. The words and the moment stay the same.
- `settings.unfenced-yes-take-back`: the phone toast's **Try again** (added in HAL-15227) does nothing while a Take back is still running, so one press can't start a second one (Liam's follow-up from the #4553 review).

## Why

The toast region sits outside the modal Settings dialog, so the toast waited, unseen and unheard, until Settings closed. C529-5 made the same call for Copy details in this section. No behaviour is removed: the phone's tests still check the toasts, two new tests cover the dialog, and one more checks that Try again waits for a running Take back.

## Covers

- settings.unfenced-yes-take-back
