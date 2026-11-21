# first-run.guide-card

- Status: active
- Since: unreleased
- Source: HAL-13433 (first-run build 5, build notes 3); first-run-flow 3.2, 3.4, 8b and 10.2 R10 (HAL-7985); `workflows.page.guide-card`

While the first run (`first-run.state`) is on in the open folder, the First Run feature shall give Support reply's page (`support-reply`) the guide card "Your first run": "This is Acme, an example company. Its support workflow reads a customer email, drafts a reply, and then waits for you to approve it.", then "The email:" before "Sam writes that an order arrived damaged.", and the button **Run your first workflow**, which opens the page's Run form. After a run that ended without a win, the button shall read **Run again**. The card shall have no ✕, and shall not show on another workflow's page, or while the first run is off, paused, done, or on in another folder.

## Examples

- Given the first run is on at Demo,
  when Support reply's page shows,
  then the guide card "Your first run" shows with **Run your first workflow**.
- Given the reply of the first run's run was rejected,
  when Support reply's page shows,
  then the card's button reads **Run again**.
- Given the user pressed **Skip, I'll explore**,
  when Support reply's page shows,
  then there is no guide card.
