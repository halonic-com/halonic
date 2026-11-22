# Decision: a run the profile's key list refused gives the command, not Models

- Approval: HAL-15762 (Paperclip task), from C624 item 3 on HAL-15756, confirmed by Liam there; wording decided by the team under HAL-2282 (the banner approved on HAL-15523, a different fix line); Liam signs this note with the pull request
- Kind: user-visible
- Task: HAL-15762

## What changes

`runs.run-view.failure-banners`: the banner for `models.key-origin-not-allowed` (from HAL-15523) now picks its fix line by the list that refused, which the cause names as `store`:

- `keychain` (a run Studio's own engine started): unchanged, "To allow it, add https://gw.example.com to the addresses of key "gw-key" in Models, then run again. Only allow an address you recognise." with **Open Models**; on a phone "Fix this on your computer: Models".
- `secrets-file` (a run `halonic run` or the background engine started, whose keys are in the profile's secrets file): "To allow it, run halonic models allow-address gw-key https://gw.example.com in a terminal, then run again. Only allow an address you recognise." with **Copy command**, as the secrets file's own banner (F24) does; on a phone "…on your computer…" with no button.
- no `store` (a run logged before this change): one line that names both, with **Open Models** and **Copy command**.

None has **Run again**, as before.

`cli.key-origin-ask`: the refusal's cause detail also gives `store` (`keychain` or `secrets-file`) when the host says where it keeps its keys' lists. `KeyOrigins` in `@halonicjs/ports` gets an optional `store` for that: `TauriKeyOrigins` says `keychain`, the CLI's `profileKeyOrigins` says `secrets-file`. Never the key's value.

## Why

Studio's Models edits only the keychain's lists (`apps/studio/src/models/workspace-key-addresses.ts`). Studio also shows runs it didn't start, whose key and list are in the profile's secrets file; for those, "in Models" pointed to a fix that doesn't change the list the run checked. The CLI's trust check already leaves Studio out for a profile key for the same reason (HAL-15503).

## Decided by the team

- The command and its caution are the CLI's own fix, so the run, `halonic run` and the trust check agree.
- The run log can't tell which store a key came from, so the refusal carries it, as a fact the host already knows. An older log, or a host that doesn't say, names both fixes rather than guess.
- The address is shell-quoted in the copied command only when it holds more than letters, digits and `.:/_-` (an IPv6 host's brackets); a key's name never needs quotes.

## Covers

- runs.run-view.failure-banners
- cli.key-origin-ask
