# inbox.proposal-undo-held

- Status: active
- Since: unreleased
- Source: HAL-10916 (Liam's review of #5135); flow-inbox 2.2; HAL-11945 section 3, rows Q7 and Q11 (engine not answering); `inbox.proposal-page`, `inbox.proposal-not-answering`

While an open run proposal's page shows that the engine isn't answering, pressing **Undo** on one of its decision toasts shall send nothing to the host, keep that toast with its **Undo**, and show the toast "Couldn't undo this." with "The engine isn't answering. Press Undo again once it answers.", or "Sign in again to send your answer." when a served Studio's sign-in ended. Once the engine answers again, or once the page has gone, **Undo** shall take the decision back as before.

## Examples

- Given the person accepted `notes/a.md` in run `01JD8Q`'s proposal and the Inbox's next load failed,
  when they press **Undo** on the toast "Accepted 1 change from run 01JD8Q",
  then nothing is sent, that toast stays, and "Couldn't undo this." says "The engine isn't answering. Press Undo again once it answers."
- Given the same toast after the engine answers again,
  when they press **Undo**,
  then `notes/a.md` is undecided again.
