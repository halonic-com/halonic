# Decision: Home and Runs empty lines name a workflow to run

- Task: HAL-10128
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-10128 (gap G1a of Sofia's first-run walk on HAL-10118; a team decision with no board card, HAL-2282 rule)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:OxrGRZH9cs6lnblhaTWM2TrEXTU2R8bpQzvDPPK60zYAHOJymYJHKq9fpC8bTuUFPcRFtwTSoR7QDKucGMOgAg==

## What changes

Home's empty Recent runs note and the empty Runs page used to say `halonic run` with no workflow
name, which fails when typed. With one or more workflows they now show `halonic run *name*`, the
first workflow in the Workflows list's order, written as the name the command takes. A workspace
with no workflow says so and points to Workflows. While the names load, or when they can't be read,
the sentence stays as it was, with no name and no error.

The requirements `runs.home` and `runs.list` gain these cases. No test was weakened or skipped.

## Why

Acme's Home read exactly like an empty workspace's although Workflows lists "Support reply", and a
user who typed the shown command got an error (HAL-10118, G1).

## Covers

- runs.home
- runs.list
