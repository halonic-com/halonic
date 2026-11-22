# Decision: Get updates' refusal over a file Halonic leaves to git shows how to get them

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-16504 (fix decided on the flow check C715, HAL-16498, finding 1)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:5Rin8pDHxGyVHvbQZtf6om6AuHT2lqG46OVmRbeKoIVF7XMonEmVF2uS93jiflS/Wsdsf8xH1+zm9ETJdUMeCQ==

Get updates refuses to start when the shared copy changed a file Halonic leaves to git, such as
`.env.example`, and its toast says to run `git pull --no-rebase` in a terminal (HAL-16448).
#5275 took Try again off that toast, because trying again is refused the same way. The flow
check C715 found that the how-to "Get updates for files Halonic leaves to git" exists, but
nothing leads to it, and nothing says what to do without a terminal.

The toast now has Show how where Try again was. It opens the how-to and leaves the toast
standing, so the file names stay in view. The how-to gains what to do with no terminal (open one
on each system, or use a git app's pull that merges) and where `git pull` gets the updates from
(the same shared copy Get updates uses, so there's nothing to set up). The refusal's words are
unchanged: the how-to carries the longer help, and the toast stays short.

The requirement `source-control.get-updates-per-item` changes its sentence about this toast and
its example. The UI test checks Show how and the address it opens. No test was weakened.

## Covers

- source-control.get-updates-per-item
- packages/studio/features/source-control/src/ui/merge-choices.test.tsx
