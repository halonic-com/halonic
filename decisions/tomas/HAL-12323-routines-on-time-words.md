# Decision: routines say they start on time only while `routines watch` runs, and the hub gets a ·

- Approval: team wording decided on HAL-12323 under the HAL-2282 rule (builds on the approved Routines screens and the CLI's own watch line); the reviewer (Liam) approves this note in review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:5i0XXBQoW8/t/GMkvOeJHVK/zafNOYhTmbiOSsSL68WVfr8dwkzLaW4QKCmASBmNVr/173q0qaA0jSeW/jMQAA==
- Task: HAL-12323

## What changes

`cli.commands.routines.list`: with routines from more than one hub, the name is now followed by a
dim · and then the hub id, so the hub no longer reads as part of the name ("Weekly report · reports"
instead of "Weekly report reports"). The one example about two hubs is updated to match; no example
is removed or weakened. The golden file `acme-routines-two-hubs.txt` changes the same way and in no
other place.

The Studio requirements `rows-and-states` and `when-card` (both draft) drop the promise that mail
starts a routine and add the CLI's line "Starts on time only while `halonic routines watch` is
running." A routine on New mail says Halonic doesn't check mail yet and starts only with Run now.

## Why

The C5 re-check on HAL-12314 found that Studio builds its engine without a scheduler in 0.1 and
`routines watch` has no mail trigger, yet the Routines screen showed next times and promised mail
starts. The words now match what 0.1 does. With two hubs the CLI printed the hub one space after the
name, which was hard to read.

## Covers

- cli.commands.routines.list
- apps/cli/src/commands/routines/golden/acme-routines-two-hubs.txt
