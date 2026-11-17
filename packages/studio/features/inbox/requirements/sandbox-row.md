# inbox.sandbox-row

- Status: active
- Since: 0.1.0
- Source: HAL-4293, HAL-1709; ux-checklists-sandbox (HAL-1833) 3.5, 3.9 and 3.10; the sandbox-start words (`app.sandbox-start-words`)

When routines didn't run because the sandbox couldn't start, the Inbox shall list one setup item for this computer (`setup:sandbox:this-computer`), whose title counts the routines: "2 routines didn't run". It shall count the routine runs that failed with `sandbox-not-ready` and that no later run has superseded: a run that started after them shows the sandbox can start. One routine that failed three times counts once. A run you started by hand isn't counted: its own page says what happened. The row's line shall be the reason's sentence from the one catalogue, `sandboxStartWords`, and the card shall show that reason and then the fix, **Check again**, the guide's link and "Didn't run because of this" with each run, named by its routine and never by its key, and its **Open run**. A reason Halonic doesn't know reads as `other`.

**Check again** shall ask the sandbox start check. When it passes, the count drops at once and the row and the card say "Fixed": the item stays, without counting, until you open another row or leave the Inbox, and has no ×. Nothing runs again by itself, and no screen offers to run anyway; each run stays failed and has **Run again** on its page, while the routines themselves start again at their next time, which the card's footer says. When the sandbox is still refused, the card shows the new reason; when the check can't run, the card says so and keeps **Check again**. When the runs that didn't run can't be read, the card says "Couldn't load the runs that didn't run." with **Try again** in their place, which reads them again (states audit gap 5, HAL-11643). On a phone the fix is the one that says to do it on the computer. Without the app's refused runs or its start check, the Inbox shall have no sandbox row.

The last passing check is kept in memory only. After a restart, a refusal shows again until a run starts after it or **Check again** passes.

The words are placeholders until HAL-1784 is approved.

## Examples

- Given two routines whose runs the sandbox refused,
  when the Inbox lists them,
  then it has the item `setup:sandbox:this-computer` titled "2 routines didn't run", with the reason's sentence, and the count is 1.
- Given a routine whose run was refused and another run of it that started later,
  when the Inbox lists them,
  then there is no sandbox item.
- Given the card is open and the check passes,
  when the Inbox loads again,
  then the row and the card say "Fixed", the count is 0 and the row stays until another row opens.
- Given the check says `bubblewrap-missing`,
  when you choose **Check again**,
  then the card shows that reason and its fix, and keeps **Check again**.
- Given any state of the card,
  when you look for a way to run anyway,
  then there is none.
