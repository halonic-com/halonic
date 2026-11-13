# Decision: the Agent sandbox section follows a running setup and says plainly what went wrong

- Task: HAL-8051
- Approval: the task asks for this change, with the wording agreed with Maya; Liam reviews it and signs this note as the CTO
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:bmexb0+uxJdX512JhI7jHq0WGRxWEhLrNa1fhFFDzHTP4ukzhiBqFBbN6hJnxkTxp8OcpiH6Nu17RLyHhtPxDQ==

## What changes

Settings › Agent sandbox, in three parts:

- **A setup or removal that already runs** when the section opens is shown as running (Setting up, without the administrator step) and is only followed until it ends. The section asks the host how it is going with `GET`s and never sends a `POST` on open to set up or remove. The step shown is neutral, not the administrator step.
- **Words for a failed check.** A check that ran and found the sandbox can't run reads "The sandbox isn't ready: …". A check that couldn't run reads "Couldn't check the sandbox: …" with the reason.
- **Time-out and removal text.** A repair that takes 3 minutes says so in the words of a repair ("The sandbox isn't repaired: the repair didn't finish within 3 minutes."). A removal that fails while several runs use the sandbox says how many, in the plural.

`settings.agent-sandbox-section` gets the first part, `settings.agent-sandbox-state` the other two, each with sentences and examples. Nothing they said before is removed or weakened: a setup still starts only on a button press, the 3-minute limit still doesn't stop the setup, and the removal still needs the dialog.

## Why

Reopening Settings during a setup could look like a fresh start and offer the administrator step again. "Not ready" and "couldn't check" are different situations for the person, and one sentence for both hid which one it was. A repair that timed out used the words of a setup, and "1 runs" style plurals read badly.

## Covers

- settings.agent-sandbox-section
- settings.agent-sandbox-state
