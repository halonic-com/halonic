# source-control.share-versions

- Status: active
- Since: unreleased
- Source: HAL-1302 (T9); ux-checklists-t8-t9 (HAL-1360) part 2, 2.3; microcopy 16

While the folder has a shared copy and versions that copy lacks, the Changes page shall show the sharing strip "1 version isn't shared yet" (or "3 versions aren't shared yet") with the action Share 1 version (or Share 3 versions). The strip shall have no fill and shall not be amber. Pressing Share shall send the versions, change the strip to "Sharing…" with no action while it runs, and then show the toast "Shared 1 version" (or "Shared 3 versions") and remove the strip. When sharing fails, the toast "Couldn't share" shall give the reason and "Nothing was sent." with Try again, and the strip shall stay. While a merge of the shared copy's versions is open, the strip shall not show. Git's own output shall never be shown.

When the page first sees a shared copy it shall ask that copy what it has, once. While every version is shared and nothing is waiting, the strip shall say "Shared with your team. Up to date." with no action. When the shared copy can't be asked, the strip shall say "Couldn't check for updates: " and the reason, with Try again, which asks again. While a share runs, pressing Share again shall do nothing and say nothing. If the branch tracks no shared branch yet, versions shall be counted against the shared copy's branch of the same name once it is known. While the history has no version yet, nothing shall be counted as unshared, whatever the shared copy holds.

Not covered yet: a teammate's versions in the strip, the larger-repository wording, the phone, and the background check.

## Examples

- Given a shared copy and 2 versions it lacks,
  when the Changes page opens,
  then the strip says "2 versions aren't shared yet" with Share 2 versions.
- Given the person presses Share 2 versions and it works,
  then a toast says "Shared 2 versions" and the strip is gone.
- Given the shared copy can't be reached,
  then a toast says "Couldn't share", gives the reason and "Nothing was sent.", and the strip stays with Share 2 versions.
- Given a shared copy, every version shared and nothing waiting,
  then the strip says "Shared with your team. Up to date." with no action.
- Given the shared copy can't be reached when asked,
  then the strip says "Couldn't check for updates: " with the reason and Try again.
- Given a history with no version yet and a shared branch it tracks,
  when the Changes page counts the versions to share,
  then it counts none and shows no sharing strip for them.
