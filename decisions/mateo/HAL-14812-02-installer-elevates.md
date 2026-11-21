# Decision: the installer asks for the sandbox's administrator rights itself

- Approval: the board asks for this fix (HAL-14812); Liam approves this note in review
- Kind: internal

On Timothy's PC the 21 Nov preview's sandbox step waited for ever with no administrator prompt (HAL-14812, part 2). The prompt was asked for by a hidden, non-interactive PowerShell three programs below the installer's window (installer → `sandbox-step.ps1` → agent host `--sandbox-setup` → PowerShell `Start-Process -Verb RunAs`), and no `consent.exe` ever started.

The installer now starts the signed helper itself with `ShellExecuteExW("runas")` and its own window as the owner, so Windows shows the prompt in front of it, and waits at most 5 minutes for the helper. Then `sandbox-step.ps1 -CheckOnly` runs only the host's unelevated `--sandbox-check`. A helper still running after 5 minutes is left to finish; the step says the sandbox isn't set up yet, and the finish page points to Settings › Agent sandbox, as it already did for every other failure.

Before it starts the helper, the installer opens it shared for reading only and keeps it open until Windows has started it, so nothing can write, rename or delete it between the two; if it can't be opened, it isn't started (HAL-14958). It doesn't check the helper's publisher: it wrote the helper from its own signed payload a moment before, and a publisher check from the 32-bit NSIS installer isn't cheap. Studio checks it (#4388).

The CI change follows the scripts: the stand-in host answers `--sandbox-check`, the `-CheckOnly` outcomes get their own cases, and a new step installs with `/S /SANDBOX=1` on the elevated runner, where Windows doesn't ask, and checks that the installer itself left the sandbox set up (the `srt-sandbox` account and its Installed apps entry). That step first removes a sandbox the earlier page walk left, with the installed `sandbox-remove.ps1`, so it starts from nothing. Nothing is skipped or weakened.

## Covers

- .github/
