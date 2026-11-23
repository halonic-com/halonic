# Decision: Settings › Agent sandbox gives the yes with Allow…, and the CLI points there

- Task: HAL-16763, from words check C665 row 56 (HAL-16044, HAL-16069)
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-16069 (the board's option (a), 23 Nov; the build and Liam's required review are on https://paperclip.halonic.com/HAL/issues/HAL-16763)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:2/Umrsk/UCjKHu2yG6JdVmWEU4URiSUNAZUbsaoorQKGuusXZ0AN+XXquG5HNCeUY+F07OiWaXQlr8VLJF5RAQ==

## What changes

- `settings.unfenced-yes-where` (edited): while Settings › Agent sandbox › **Plugins and integrations** needs a yes that isn't saved, the block shows **Allow…** in place of "Give it from a plugin's page in Plugins: open the plugin, then Review." and **Open Plugins**. **Allow…** opens a dialog with R3's reason, fix and docs link (`runnerUnfencedWords`) and R5's checkbox in the plugin check's words, imported from the plugins feature, not copied. **Allow** stays unavailable until the box is ticked, and saves the yes through `UnfencedYesService`, the window's one yes object that a plugin's Review and the workspace trust check save through, so it is the same yes for the whole computer and waits for a Take back under way. No new native command, route or storage: the agent host's existing `POST /v1/unfenced-runs/allow` saves it, and the host still checks the saved yes at every start. The tests that checked the old line and **Open Plugins** now check **Allow…** and its dialog; none is weakened, and more tests run for the requirement.
- `cli.local-integration-unfenced-yes` and `cli.run-connector-warning` (edited): the refusal's fix becomes "To allow it, open Settings › Agent sandbox in Studio on this computer.", in place of "To allow it, trust this workspace in Studio on this computer.". The tests that checked the old line check the new one. Where Studio's yes doesn't reach the command (Windows with the WSL sandbox), the refusal keeps R3's fix as before.
- `docs/security/sandbox.md` and `docs/security/plugins.md` name Settings › Agent sandbox next to the trust check as the place the yes is given.

## Why

A workspace that's already trusted, also with `halonic trust`, opens no trust check (`needsNoTrust`). Then the only place to give the yes was a plugin's Review, and only with a plugin installed, so someone with only a local integration had nowhere to say yes, and the CLI's line sent them to a check that never opens. The board chose one place for a yes that covers the whole computer (option (a) on HAL-16069).

## Decided by the team

- The dialog's title "Allow plugins and integrations to run without the sandbox?" and its button **Allow** (busy "Allowing…") are new words; Nina checks only these on HAL-16763 (HAL-16355). Everything else reuses approved words: R3, R5, R16, "Allowed without the sandbox" and UY2's "Halonic couldn't save your yes to run plugins and integrations without the sandbox".
- The reason in the dialog uses R3's plugin words, as the block's saved-yes row already does, since the yes covers plugins and integrations alike.
- **Allow…** shows only for a reason Studio has words for, as the trust checks ask for no yes they can't name; the host decides at every start anyway.
- When the host saves nothing (the reason changed, or a Take back is under way), the dialog stays open with the reason that holds now, unticks the box, focuses it and reads the reason once, as both trust checks do (C681).

## Covers

- settings.unfenced-yes-where
- cli.local-integration-unfenced-yes
- cli.run-connector-warning
