# Decision: `halonic init --example acme` and its golden output

- Requirements: `cli.commands.init.copy-example` (new), `workspace.copy` (new)
- Task: HAL-2336, step 3; the words come from cli-output 3.1 ("The Acme example"), approved by the board on HAL-2123
- Approval: the maintainer approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:epEWyoadj7OFC+oQ1SII9q0sxUJ2oFZr/C0OrquxYTynLbuWwCSphlzX8YZDerjIDeMe4dQC+xxT4RfQRXIpDA==

## What changes

`halonic init` gets `--example acme`. It copies the repository's `examples/acme` with the new
`copyWorkspace` from `core/workspace`, into the folder named, or else into the first of `./acme`,
`./acme-2`, … that is missing or empty, so a second copy never overwrites the first. The output is
cli-output 3.1's word for word: the ✓ line, the dimmed counts, and the `Next:` block with `cd`,
`halonic test`, `halonic run support-reply --input examples/refund-question.json` and the Studio
line. The usage line becomes `halonic init [folder] [--example acme]`, as in cli-output 1.3.

The new golden file `apps/cli/src/commands/init/golden/example.txt` records that output in colour,
without colour and with `--json`. The empty-workspace goldens don't change.

## Tests

No test was weakened. The one existing test whose words change is the usage line after two folder
names, which now shows `[--example acme]` as the design does. New tests cover the copy, a second
copy next to the first, a named folder with files in it, an unknown example with and without a
"Did you mean", `--json`, and that the copy uses only the test model and no connector, so the
`run` line needs no key and no trust (Liam on HAL-1984).

## Covers

- cli.commands.init.copy-example
- workspace.copy
- apps/cli/src/commands/init/golden/example.txt
