# Decision: fix words for setup-conflict, distro-missing and runtime-missing

- Approval: Paperclip task HAL-16233 (follow-up Liam asked for on HAL-16200); small wording on an approved screen, decided by the team (HAL-2282); Liam signs this note in review on HAL-16233
- Kind: user-visible

Since HAL-16200, Settings › Agent sandbox shows `setup-conflict`,
`distro-missing` and `runtime-missing` as Not available, because its
**Repair the sandbox** button can't fix them. But the catalogue still sent
all three to Settings ("open Settings and set up the sandbox there."), so
the Inbox and the run page pointed to a button that doesn't help, and
Settings, which hides that fix as its own, showed no fix at all.

The fixes now say what really works:

- `distro-missing` and `runtime-missing`: "use Halonic inside WSL 2 on this
  computer.", word for word the CLI's fix (HAL-16186), in Settings too.
  Nothing in Studio imports Halonic's distro or finishes its runtime yet,
  and restarting Studio doesn't either, so there is no Studio step to name.
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
test that checked all four codes point to Settings is now three: one for
`setup-needed`, one for the two WSL codes, one for `setup-conflict`, with as
many `expect` calls as before. The CLI's list of fixes that differ from
Studio's on purpose drops `distro-missing` and `runtime-missing`, which are
now the same.

## Covers

- app.sandbox-start-words
