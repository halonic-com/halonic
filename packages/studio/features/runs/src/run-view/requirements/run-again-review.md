# runs.run-view.run-again-review

- Status: draft
- Since: unreleased
- Source: HAL-13143 (C144 RT1, decided by the designer on the task); `runs.run-view.run-again`, `workspace.trust-asked`

When **Run again** is refused because the workspace isn't trusted yet (a `denied` refusal) and the app can open the trust check, the page shall keep the sentence "Couldn't start the run: *reason*" and offer **Review** under it, which opens the same trust check as the status bar's "Not trusted yet · Review". **Not now** shall leave the sentence and **Review**. Once the person trusts the workspace, the sentence shall go and **Run again** shall take focus: the header's on the run page, the banner's on the Run panel's run card. Any other refusal, and a page whose app can't open the trust check, shall have no **Review**.

## Examples

- Given a failed real run and a host that refuses with "This workspace isn't trusted yet, so nothing was started." (`denied`),
  when **Run again** is pressed,
  then the page says "Couldn't start the run: This workspace isn't trusted yet, so nothing was started." with **Review** under it.
- Given the person presses **Review** and then **Trust**,
  then the sentence goes and **Run again** has focus.
- Given a host that rejects with "The workflow changed.",
  when **Run again** is pressed,
  then there is no **Review**.
