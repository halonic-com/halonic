# Decision: the Runs line says what is true about the sandbox

- Approval: Mara's claims check on HAL-9383 (items 2 and 3), a small fix the team decides; Liam signs this note with the pull request
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:LqcGOhC/PaYe//Glirt92YTy04KymoFAtE3sfwZleuAxy04rJudWBW6aDzJ6h8XmTgryrWaGcvfrpFWLB89GCw==
- Task: HAL-9383

## What changes

`plugins.plugin-trust-check`: a program's Runs line and the summary no longer promise the sandbox in every case. The engine runs a plugin's programs only in a working sandbox (`PluginLocalTools.state()`), so the line follows that state: it runs in the agent sandbox, it doesn't run on a device with no sandbox, or it doesn't run now because the sandbox can't start. When the app doesn't say, the line holds in every case. The summary follows the same state: it says "starts 1 program in a sandbox on this computer" only when the program can run (or the app doesn't say), and "has 1 program that doesn't run here" or "doesn't run now" when it can't, so it never reads against the Runs line. The plugin actions take an optional `programsRun`, which the app fills in with HAL-9373.

## Why

"In the agent sandbox" was shown even where no sandbox works, which promised protection that wasn't there.

## Covers

- plugins.plugin-trust-check
