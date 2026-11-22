# runs.run-view.run-again-review

- Status: draft
- Since: unreleased
- Source: HAL-13143 (C144 RT1, decided by the designer on the task); `runs.run-view.run-again`, `workspace.trust-asked`; **Review** only for the engine's untrusted refusal, by its code (HAL-14813, HAL-15002); a folder that isn't open as S4's unexplained failure (C613 row 33, HAL-15683)

When **Run again** is refused because the workspace isn't trusted yet (a `denied` refusal with the code `workspace.untrusted`) and the app can open the trust check, the page shall keep the sentence "Couldn't start the run: *reason*" and offer **Review** under it, which opens the same trust check as the status bar's "Not trusted yet · Review". **Not now** shall leave the sentence and **Review**. Once the person trusts the workspace, the sentence shall go and **Run again** shall take focus: the header's on the run page, the banner's on the Run panel's run card. When the person trusts it elsewhere, such as from the status bar, the sentence shall go too and focus shall stay where it is (C552 finding 7). Any other refusal, including any other `denied`, and a page whose app can't open the trust check, shall have no **Review**. The desktop shell's refusal of a folder that isn't open (`folder_not_open`) shall say "Couldn't start the run: Halonic ran into a problem it can't explain yet." with **Copy details** and no **Try again**, as `shell.start-failure` words it.

## Examples

- Given a failed real run and a host that refuses with "This workspace isn't trusted yet, so nothing was started." (`denied`, code `workspace.untrusted`),
  when **Run again** is pressed,
  then the page says "Couldn't start the run: this workspace isn't trusted yet, so nothing was started." with **Review** under it.
- Given the person presses **Review** and then **Trust**,
  then the sentence goes and **Run again** has focus.
- Given that sentence on the page,
  when the person trusts the workspace from the status bar,
  then the sentence and its **Review** go, and focus stays in the status bar.
- Given a host that rejects with "The workflow changed.",
  when **Run again** is pressed,
  then there is no **Review**.
- Given a host that refuses with "The run store refused the call: /workspaces/acme is not an opened folder" (`denied`, the shell's `folder_not_open` as its cause),
  when **Run again** is pressed,
  then the page says "Couldn't start the run: Halonic ran into a problem it can't explain yet." with **Copy details** and no **Try again** or **Review**.
