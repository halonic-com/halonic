# inbox.proposal-page

- Status: active
- Since: unreleased
- Source: HAL-10916; flow-inbox 2.2; HAL-11945 section 3, rows Q3 to Q7; HAL-15092 (C539 P3 and P4); HAL-15986 (C661 2: a proposal the window can't decide names the command)

When a run proposal is opened from Needs you, the Inbox shall show its title as the row has it, then the run's workflow, the time its run ended and what started it, with **Reject all** and **Accept all**, neither in a danger tone. Before the changes it shall say that accepting changes the files and doesn't take back what the run did outside them, naming the run in lowercase inside the sentence, with a link to the run; for a run that didn't finish, it shall first say that the changes may be incomplete. It shall list each changed file with **Reject** and **Accept**. While a decision is sent its button shall be busy and the others shall ignore presses. Once decided, the file's line shall say **Accepted** or **Rejected** in place of its buttons, the decision shall be announced, and focus shall move to the next undecided **Accept**, else to what the proposal came to. Each decision shall show a toast, "Accepted 3 changes from run 01JD8Q", with **Undo**, which takes back that whole decision; **Accept all** and **Reject all** are one decision for what was undecided. Only the newest decision's toast shall offer **Undo**. A file the host doesn't put back on **Undo** shall keep its decision, with a danger toast "Couldn't undo this." that names it. A file the person changed after the run started shall stay undecided with a line that says so, and a decision that fails shall say what failed and why, with **Try again**. The proposal shall be settled only after the page is left, any decision on its way is done and its last toast has gone. Where the window can't accept or reject, the page shall show the changes without **Reject all**, **Accept all** or the files' buttons, and while a file is undecided end with "Studio can't accept or reject these changes here. To see them and decide, run this in a terminal:" and the command `halonic proposals show 01JD8Q` to copy, the run's short id as the title has it, which shows the diffs and how to accept or discard. In Needs you, every row's title shall wrap rather than be cut, so the end that tells two rows apart, such as the item a proposal changes, shows.

## Examples

- Given run `01JD8Q` of *Support triage*, finished at 06:12 and started by a schedule,
  when its proposal opens,
  then the line under the title reads "Support triage · Finished at 06:12 · Started by a schedule".
- Given a run that failed,
  when its proposal opens,
  then "Run 01JD8Q didn't finish, so these changes may be incomplete." comes before what accepting does.
- Given a proposal with two undecided files,
  when the person accepts the first,
  then its line reads Accepted, "Accepted: notes/a.md changed" is announced, focus is on the second file's Accept, and a toast "Accepted 1 change from run 01JD8Q" has Undo.
- Given that toast,
  when the person presses Undo,
  then the decision is undone and the first file has its buttons again.
- Given two files accepted one after the other,
  then only the second decision's toast shows, and should the first one's Undo still be pressed and the host leave `notes/a.md` alone, it stays Accepted and "notes/a.md changed after it was accepted, so it stays accepted." shows.
- Given Accept all on two files, whose Undo the host restores for `notes/a.md` only,
  then `notes/a.md` has its buttons again and `notes/b.md` stays Accepted, with a danger toast that names it.
- Given a proposal with two undecided files,
  when the person presses Reject all,
  then both read Rejected, the toast reads "Rejected 2 changes from run 01JD8Q", and focus is on "Rejected".
- Given an accept that fails with a reason,
  then "Couldn't accept this change." and the reason show with Try again, and the file stays undecided.
- Given a decided proposal whose toast still shows,
  when the page is left,
  then the proposal is settled only once the toast has gone.
- Given an accept still on its way when the page is left,
  then the proposal is settled only once that accept's toast has shown and gone.
- Given a window that can't accept or reject,
  when run `01JD8Q`'s proposal opens,
  then it has no Accept or Reject, and its changes end with "Studio can't accept or reject these changes here. To see them and decide, run this in a terminal:" and `halonic proposals show 01JD8Q`.
- Given the row of run `01JD8Q`'s proposal to *Support triage* in the 360 px list,
  then its title wraps rather than being cut.
