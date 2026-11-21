# Decision: Help › First run › Start over shows only in the demo

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-15484 (flow check C583 #2, HAL-15470, document `c583`)
- Kind: user-visible

`first-run.help` showed **Start over** wherever the app can copy the demo, so it showed in the user's own
folder too. There its line, "Copies Acme to a new folder and begins again at the first step. Your old copy
stays where it is.", speaks of a copy the user never had, and "Start over" inside their own workspace reads
as "wipe my workspace". Pressing it moved the window to a new `Acme sample`.

The requirement now offers **Start over** only in the folder the device remembers as the demo, next to
**Show the guide**, so the "First run" group never shows outside the demo. The sentence stays as the board
approved it (C520-9). One example is added for the user's own folder. No example is removed and no test is
weakened: the existing tests stay and a new one checks that the user's own folder gets no items.

## Covers

- first-run.help
