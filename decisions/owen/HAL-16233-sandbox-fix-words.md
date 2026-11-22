# Decision: fix words for setup-conflict, distro-missing and runtime-missing

- Approval: Paperclip task HAL-16233 (follow-up Liam asked for on HAL-16200) and HAL-16277 (C692's findings 1 and 2); small wording on an approved screen, decided by the team (HAL-2282); Liam signs this note in review on HAL-16233
- Kind: user-visible

Since HAL-16200, Settings › Agent sandbox shows `setup-conflict`,
`distro-missing` and `runtime-missing` as Not available, because its
**Repair the sandbox** button can't fix them. But the catalogue still sent
all three to Settings ("open Settings and set up the sandbox there."), so
the Inbox and the run page pointed to a button that doesn't help, and
Settings, which hides that fix as its own, showed no fix at all.

The fixes now say what really works:

- `distro-missing`: "use Halonic inside WSL 2 on this computer.", word for
  word the CLI's fix (HAL-16186), in Settings too. Nothing in Studio imports
  Halonic's distro yet, so there is no Studio step to name.
- `runtime-missing` (HAL-16277): "try again, and Halonic finishes the setup
  as the sandbox starts. If it still doesn't finish, reinstall Halonic
  Studio." In Settings: "Choose Check again, and Halonic finishes the setup.
  …". Studio installs the runtime it ships each time it starts the agent
  host (`install_runtime_beside_shell`), and every host call starts the host
  again when none is running, Settings' check included, so trying again
  really retries the setup that failed. A reinstall brings back the shipped
  runtime for an install that fails every time. The CLI keeps "use Halonic
  inside WSL 2": it can't install Studio's runtime, and on plain Windows it
  runs integrations in the sandbox only inside WSL 2 anyway. The ADR's
  consequences and the shell's comment that still named the repair say this
  now too.
- `setup-conflict`: "remove the other program's sandbox setup, then set up
  the sandbox in Settings." Halonic never forces srt's install over another
  program's, and once that setup is gone the reason becomes `setup-needed`,
  which Settings' **Set up the sandbox** button does fix. In Settings it
  reads "Remove the other program's sandbox setup, then choose Check again.",
  since the person is there already.

`setup-needed` keeps pointing to Settings, with no fix line there. The
catalogue gets an optional Settings fix of its own for `setup-conflict`.

The requirement changes only in this:

- `app.sandbox-start-words`: "a fix the command line words as 'use Halonic
  inside WSL 2' points to Settings" now applies to `setup-needed` only; the
  three codes get the rules above, with an example each.

No test is removed or skipped. In `packages/core/app`'s words test, the one
test that checked all four codes point to Settings is now four: one each
for `setup-needed`, `distro-missing`, `runtime-missing` and `setup-conflict`,
with more `expect` calls than before. The CLI's list of fixes that differ
from Studio's on purpose drops `distro-missing`, which is now the same, and
adds `runtime-missing`, for the reason above.

## Covers

- app.sandbox-start-words
