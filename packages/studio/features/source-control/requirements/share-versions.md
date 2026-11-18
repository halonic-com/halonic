# source-control.share-versions

- Status: active
- Since: unreleased
- Source: HAL-1302 (T9); ux-checklists-t8-t9 (HAL-1360) part 2, 2.3; microcopy 16

While the folder has a shared copy and versions that copy lacks, the Changes page shall show the sharing strip "1 version isn't shared yet" (or "3 versions aren't shared yet") with the action Share 1 version (or Share 3 versions). The strip shall have no fill and shall not be amber. Pressing Share shall send the versions, change the strip to "Sharing…" with no action while it runs, and then show the toast "Shared 1 version" (or "Shared 3 versions") and remove the strip. When sharing fails, the toast "Couldn't share" shall give the reason and "Nothing was sent." with Try again, and the strip shall stay. While a merge of the shared copy's versions is open, the strip shall not show. Git's own output shall never be shown.

Not covered yet: a teammate's versions, up to date, couldn't check, the larger-repository wording, the phone, and the background check.

## Examples

- Given a shared copy and 2 versions it lacks,
  when the Changes page opens,
  then the strip says "2 versions aren't shared yet" with Share 2 versions.
- Given the person presses Share 2 versions and it works,
  then a toast says "Shared 2 versions" and the strip is gone.
- Given the shared copy can't be reached,
  then a toast says "Couldn't share", gives the reason and "Nothing was sent.", and the strip stays with Share 2 versions.
- Given a shared copy and every version shared,
  then there is no strip.
