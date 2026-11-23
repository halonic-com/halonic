# inbox.proposal-compare

- Status: active
- Since: unreleased
- Source: HAL-16056 (C666 #1: a file changed since the run had no Accept, Reject or Compare); HAL-11945 row Q9; HAL-16075 (Compare's words); `inbox.proposal-page`

When a file of a run proposal changed after the run started, the proposal page shall keep **Reject** and **Accept** on it, with the line "This file changed after run 01JD8Q started. Accept opens Compare." When an **Accept** or **Accept all** leaves such a file alone, or **Accept** is pressed on one, the page shall open Compare under it, one file at a time, take focus to it, and show the file's text now ("Yours") and the run's ("Run 01JD8Q's") side by side, "No file" in muted text for one that doesn't exist, with **Keep mine**, **Use the run's**, **Combine both** only when the two don't change the same lines, and **Cancel**. **Keep mine** shall count as Rejected and the others as Accepted, each one decision with its toast and **Undo**; then Compare shall move to the next such file that Accept left, else close. A choice shall send what Compare showed, so a file saved again meanwhile is not written over: the page shall then say "This file changed after Compare opened, so nothing was written. Here it is now." and read the texts again. A choice that fails shall say "Couldn't apply your choice." with the reason and **Try again**, which sends it again, and keep Compare open. Texts that can't be read shall say "Couldn't open Compare." with the reason, **Try again** and **Close**, which closes Compare. **Cancel** shall close Compare and leave the file undecided.

## Examples

- Given run `01JD8Q` proposes `notes/a.md` and the file changed since the run started,
  when they press its **Accept**,
  then Compare opens under it with their text and the run's, and focus is on it.
- Given Compare open on `notes/a.md`,
  when they press **Keep mine**,
  then the file says Rejected, the toast says "Rejected 1 change from run 01JD8Q" and Compare closes.
- Given Compare open on texts that change different lines,
  when they press **Combine both**,
  then the file is chosen with what Compare showed and says Accepted.
- Given **Accept all** on two files where one changed since the run started,
  when it comes back,
  then the other says Accepted and Compare opens on the changed one.
- Given `notes/a.md` was saved again after Compare opened,
  when they press **Use the run's**,
  then nothing is written, the page says so and shows the file as it is now.
- Given **Use the run's** fails because the engine isn't answering,
  when they press **Try again** once it answers,
  then the same choice is sent again and the file says Accepted.
