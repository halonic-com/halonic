# Decision: the profile returns the workspace key, and the loopback server keeps only waited-for requests

- Approval: Liam asked for both changes in his re-review of PR #2694 (https://github.com/halonic-com/halonic/pull/2694#issuecomment-6884325678) and filed them as HAL-9602; the package owner (Liam) approves this note in review
- Kind: internal
- Task: HAL-9602

## What changes

`workspaceFolders` in `@halonicjs/profile` also returns `key`, and the sign-in command uses it
instead of cutting the last part from `folder`. The loopback callback server answers a request with
a wrong `state`, or one no sign-in waits for, with a neutral page and does not keep it. Examples
are added for both. No example was removed or weakened.

## Why

Reading the key from the end of the folder path let the setup record's link and the profile drift
apart. A wrong-`state` request used to get "you can close this tab", which told a stray visitor the
sign-in worked, and requests nobody waited for were kept in memory.

## Covers

- cli.loopback-callback
- profile.workspace-folders
