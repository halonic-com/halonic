# sandbox-srt.runner-temp-folder

- Status: active
- Since: 0.1.0
- Source: HAL-10674

When the sandbox-srt adapter makes the temp folder for one runner, it shall make it private to the current user. On Linux and macOS it shall be a new folder in the private parent with mode 0700. On Windows the runner sees the folder's path, and the private parent is inside the user's profile folder, so the adapter shall make the folder outside the profile: in an account folder directly in the shared folder (`%ProgramData%`, where every account may read and make folders), named by a hash of the account's SID so the name holds nothing of the account. It shall restrict an account folder that this call made to the current user (this user the owner and the only access entry, nothing inherited). It shall never repair an account folder that was already there, because whoever made it may keep an entry in it: it shall use one only when it is a plain folder, this user owns it, and its access list is exactly one full-control entry for this user that is not inherited. When the account folder is refused, can't be made or restricted, or there is no shared folder, it shall make the folder in the private parent instead and log one line, and a folder it made and could not restrict it shall remove, so a runner never gets a folder another account might reach.

## Examples

- Given Windows and a user with SID `S-1-5-21-1-2-3-1001`,
  when a runner temp folder is made,
  then it is `r-…` in a folder named by the hash of that SID directly in the shared folder, and that folder was restricted to the SID.
- Given an account folder that is already private to the user,
  when two runner temp folders are made,
  then they share it, and its access list is not changed.
- Given an account folder that another account made, with an entry of its own or the user's ownership handed over,
  when a runner temp folder is made,
  then the folder is made in the private parent, one line is logged, and the account folder is not changed.
- Given a link where the account folder should be,
  when a runner temp folder is made,
  then the folder is made in the private parent and the link's target is not changed.
- Given Windows and no shared folder,
  when a runner temp folder is made,
  then it is in the private parent.
- Given Linux,
  when a runner temp folder is made,
  then it is a new folder with mode 0700 in the private parent.
