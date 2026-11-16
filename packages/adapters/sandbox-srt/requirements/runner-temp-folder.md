# sandbox-srt.runner-temp-folder

- Status: active
- Since: 0.1.0
- Source: HAL-10674

When the sandbox-srt adapter makes the temp folder for one runner, it shall make it private to the current user. On Linux and macOS it shall be a new folder in the given parent with mode 0700. On Windows, where the parent is shared by every account of the computer and mode bits do nothing, it shall give each account a folder of its own in the parent, named by a hash of the account's SID so the name holds nothing of the account, restrict that folder to the current user (this user the owner and the only access entry, nothing inherited), and make the run's folder inside it. It shall refuse a parent or account folder that is a link or junction, and one another account owns, and it shall throw when the access list can't be set, so a runner never gets a folder another account might reach.

## Examples

- Given Windows and a user with SID `S-1-5-21-1-2-3-1001`,
  when a runner temp folder is made,
  then it is `r-…` in a folder named by the hash of that SID, and that folder was restricted to the SID.
- Given the same user twice,
  when two runner temp folders are made,
  then they share the account folder and differ in their own names.
- Given a link where the account folder should be,
  when a runner temp folder is made,
  then it throws and the link's target is not changed.
- Given an account folder another account owns,
  when taking the ownership fails,
  then it throws and no run folder is made.
- Given Linux,
  when a runner temp folder is made,
  then it is a new folder with mode 0700 in the parent.
