# Decision: a Cancel in the shell's window before the yes is saved says nothing

- Task: HAL-17065, from words check HAL-17061 on #5473 (HAL-16466)
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-17065 (a team decision that builds on approved screens, HAL-2282; Liam's required review is on the same task)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:4Oo74eh4vBRyD2v+dY/hrAwWCmzM5pH8pcVjjUhFhiY5wcAquuoELP8Y78dmgnVeIeXkWhchZPC94j6R/wxpCw==

## What changes

- `workspace.trust-check-unfenced-yes`, `plugins.plugin-trust-yes` and `settings.unfenced-yes-where` (edited): when the person ticks the box, presses **Trust** or **Allow**, and then presses Cancel in the desktop shell's own "Allow plugins and integrations to run without the sandbox?" window, the shell refuses the call as `declined` and saves nothing. The workspace trust check, the plugin trust check (Review and update) and Settings › Agent sandbox's **Allow…** dialog now treat that as the person's Cancel: the dialog stays open as it was, busy ends, the box stays ticked, nothing is trusted, and no error line shows. Until now each showed the shell's sentence as a failure, in the workspace check as "Couldn't save trust: Nothing was saved because the confirmation window was cancelled.. Nothing was started.". Each requirement gets one sentence and one example for this; nothing in them is taken away, and more tests run for each.
- The shell's sentence stays in the workspace check's result (`reason`, `error`) for Copy details and logs; it never reaches the screen.
- The native dialog's last line reads "Allow only if you just chose this in Halonic.", the pattern of the approved "Continue only if you just chose this in Halonic.", in place of "Allow only if you just allowed this in Halonic.". The shell's behaviour doesn't change.

## Why

The person pressed Cancel on purpose; telling them three times that nothing happened reads as an error. The sandbox choice's Cancel in the shell (HAL-16342) already answers the choice as it was with no error, so this follows it.

## Covers

- workspace.trust-check-unfenced-yes
- plugins.plugin-trust-yes
- settings.unfenced-yes-where
