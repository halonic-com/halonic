# Decision: Get updates shows the git command to copy, and two trust check details (C716)

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-16516 (fixes decided on the design check C716, HAL-16499, rows 1 to 3; a team decision on screens the board approved, HAL-2282)
- Kind: user-visible

**Get updates over a file Halonic leaves to git (row 1).** The refusal's toast carried the git
steps, and in the toast's narrow column `git pull --no-rebase` broke across lines as plain text,
with nothing to copy. The refusal now only names the files ("updates change .env.example and
logs/NOTES~1.md, which Halonic leaves to git."), so the toast stays short. The Changes page shows
the steps under Get updates in an info Callout: the lead sentence, the command in the kit's
`CommandBox` with Copy command, and the sentence about conflicts. The words are the same; only the
command moved into its box. The Callout goes when Get updates is pressed again. The requirement
`source-control.get-updates-per-item` says so, and its example's refusal text is the shorter one.
The tests that expected the steps in the refusal and the toast now expect them on the page, and a
new UI test checks the Callout, its command, its copy button, its link and that it goes away.

**The how-to link (C714 row 7, HAL-16518).** The words check asked for the command to copy (done
above) and a link to the new how-to, `docs/how-to/get-updates-for-files-halonic-leaves-to-git.md`.
The Callout ends with an `ExternalLink` "Get updates for files Halonic leaves to git" to that page
on GitHub, as the proxy how-to link in run failures does until docs.halonic.dev has it. Bundled
here because it's the same Callout; a third stacked PR would go past the two-PR stack.

**Trust check, Gets secrets (row 2).** A program's secret names are the env var names it gets, so
the line now has the `code` tone, in mono like `PATH` under it. The requirement
`studio.trust-review-program-fields` names the secrets among the values marked as code, with a new
test that fails without the fix. The dialog test's program row now gives its secret the `code`
tone, so it expects that value in mono instead of in the text font; its label stays in the text
font.

**Trust check below 24rem (row 3).** With each label over its value, the pairs ran together: 0 px
from a value to the next label. The lines grid gets `@max-[24rem]:gap-y-2`, so a label sits 4 px
above its value and 8 px below the value before. `workspace.trust-check-narrow-lines` says so, and
its test checks the class.

No test was weakened: every changed expectation checks the new behaviour.

## Covers

- source-control.get-updates-per-item
- studio.trust-review-program-fields
- workspace.trust-check-narrow-lines
- packages/studio/features/source-control/src/ui/merge-choices.test.tsx
- apps/studio/src/changes/workspace-merge.test.ts
- packages/studio/features/workspace/src/trust/trust-check-dialog.test.tsx
