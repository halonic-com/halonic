# Decision: an agent's placement choice is checked against the file of the run's version

- Approval: scope decided on HAL-6477 and HAL-9301 (Liam); the package owner (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:Db6BgRCzNSnBbsffYVsoQQOvZiuuCcBph+cFLjKacJ34m//X5EcYDaTnemiN9+AcZ05VozuZqJJgED0/mNiGBw==

## What changes

`harness-host.placement` now reads the agent's file as the version the agent's run uses has it, not
always as it is on disk now. `AgentFiles.bytesOf` gets the run (its id and the version it read, which the engine now gives every `HarnessAgent`). For `halonic routines watch`, the
CLI answers from the agent texts taken when the run's version was loaded, found by the run's recorded version, so a child run is found too; for every other run, from
disk, as before. `cli.local-harness-host` also says the bridge gets no secrets. No example was removed
or weakened.

## Why

A routine run starts from the live version, which may differ from the files on disk. The choice "On
this computer" belongs to one file's bytes, so checking the disk's file could run an agent unfenced on
the strength of a choice made for another version, or fence one the person chose to unfence. The
bridge serves no provider key yet, so it needs no secrets.

## Covers

- harness-host.placement
- cli.local-harness-host
