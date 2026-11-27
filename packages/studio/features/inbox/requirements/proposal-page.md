# inbox.proposal-page

- Status: active
- Since: unreleased
- Source: HAL-10916; flow-inbox 2.2; HAL-11945 section 3, rows Q3 to Q7; HAL-15092 (C539 P3 and P4); HAL-15986 (C661 2: a proposal the window can't decide names the command); HAL-16066 (C665 26: a file changed since the run keeps Reject; C671 22: a window that can't decide says to use the desktop app or the command on your computer; HAL-16157, C682 1: in a terminal on your computer, as the empty window's line); HAL-16056 (HAL-11945 row Q9: once Compare ships, **Accept** on a file changed since the run opens it, `inbox.proposal-compare`); HAL-20018 (Noah's decision: the Inbox's 80px rows clamp the title to two lines)

When a run proposal is opened from Needs you, the Inbox shall show its title as the row has it, then the run's workflow, the time its run ended and what started it, with **Reject all** and **Accept all**, neither in a danger tone. Before the changes it shall say that accepting changes the files and doesn't take back what the run did outside them, naming the run in lowercase inside the sentence, with a link to the run; for a run that didn't finish, it shall first say that the changes may be incomplete. It shall list each changed file with **Reject** and **Accept**. While a decision is sent its button shall be busy and the others shall ignore presses. Once decided, the file's line shall say **Accepted** or **Rejected** in place of its buttons, the decision shall be announced, and focus shall move to the next undecided file's **Accept**, else to what the proposal came to, unless Compare is open. Each decision shall show a toast, "Accepted 3 changes from run 01JD8Q", with **Undo**, which takes back that whole decision; **Accept all** and **Reject all** are one decision for what was undecided. Only the newest decision's toast shall offer **Undo**. A file the host doesn't put back on **Undo** shall keep its decision. When the Undo put back the decision's other files, a toast "Undid part of the changes from run 01JD8Q" shall name it: "Couldn't put back notes/a.md: it changed after it was accepted."; when it put back none, a danger toast "Couldn't undo this." shall name it. When a later decision on one of its files kept the whole Undo back, a danger toast shall say "Couldn't undo this: you decided more of run 01JD8Q's changes after it." A file that changed after the run started shall stay undecided with a line that says so and that **Accept** opens Compare, and keep its **Reject** and **Accept** (`inbox.proposal-compare`). A decision that fails shall say what failed and why, by the failure's kind and never in the host's words: "The engine isn't answering. It may still be starting." with **Try again**; "This workspace isn't trusted yet, so Halonic can't change its files." with **Review**, which opens the workspace's trust check, the line going once the workspace is trusted; otherwise "Halonic ran into a problem it can't explain yet." with **Copy details**, which copies the host's words. An **Undo** that fails shall show a danger toast "Couldn't undo this." with the same reason, and **Copy details** for a problem Halonic can't explain. The proposal shall be settled only after the page is left, any decision on its way is done and its last toast has gone. Where the window can't accept or reject, the page shall show the changes without **Reject all**, **Accept all** or the files' buttons, and while a file is undecided end with "Studio can't accept or reject these changes here. To see them and decide, use the desktop app, or run this in a terminal on your computer:" and the command `halonic proposals show 01JD8Q` to copy, the run's short id as the title has it, which shows the diffs and how to accept or reject. In Needs you, every row's title shall wrap rather than be cut, so the end that tells two rows apart, such as the item a proposal changes, shows; in the Inbox's own list, whose rows are 72px, it shall take at most two lines and then be cut with an ellipsis, its whole title still in the row's name and the open item's header.

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
  then only the second decision's toast shows, and should the first one's Undo still be pressed and a later decision keep it back, `notes/a.md` stays Accepted and "Couldn't undo this: you decided more of run 01JD8Q's changes after it." shows.
- Given an accept of `notes/a.md` whose Undo the host can't put back because it changed,
  then it stays Accepted and "Couldn't undo this." with "notes/a.md changed after it was accepted, so it stays accepted." shows.
- Given Accept all on two files, whose Undo the host restores for `notes/a.md` only,
  then `notes/a.md` has its buttons again and `notes/b.md` stays Accepted, with a toast "Undid part of the changes from run 01JD8Q" and "Couldn't put back notes/b.md: it changed after it was accepted."
- Given a proposal with two undecided files,
  when the person presses Reject all,
  then both read Rejected, the toast reads "Rejected 2 changes from run 01JD8Q", and focus is on "Rejected".
- Given an accept that leaves `notes/a.md` alone because it changed after run `01JD8Q` started,
  then its line says "This file changed after run 01JD8Q started. Accept opens Compare.", Compare opens under it, its Reject and Accept stay, and the proposal stays open until it is decided.
- Given an accept that fails for a reason Halonic can't explain,
  then "Couldn't accept this change. Halonic ran into a problem it can't explain yet." shows with Copy details and no Try again, and the file stays undecided.
- Given an accept that fails because the engine isn't answering,
  then "Couldn't accept this change. The engine isn't answering. It may still be starting." shows with Try again.
- Given an accept refused because the workspace isn't trusted yet,
  then "Couldn't accept this change. This workspace isn't trusted yet, so Halonic can't change its files." shows with Review,
  and once the workspace is trusted the line goes.
- Given a decided proposal whose toast still shows,
  when the page is left,
  then the proposal is settled only once the toast has gone.
- Given an accept still on its way when the page is left,
  then the proposal is settled only once that accept's toast has shown and gone.
- Given a window that can't accept or reject,
  when run `01JD8Q`'s proposal opens,
  then it has no Accept or Reject, and its changes end with "Studio can't accept or reject these changes here. To see them and decide, use the desktop app, or run this in a terminal on your computer:" and `halonic proposals show 01JD8Q` with Copy command.
- Given the row of run `01JD8Q`'s proposal to *Support triage* in the 360 px list,
  then its title wraps rather than being cut.
- Given the row "Approve the refund for the Acme order from last week" in the Inbox's 360 px list,
  then its title takes at most two lines, then is cut, and the row stays 72px high.
