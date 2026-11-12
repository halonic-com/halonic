# system-node.start-folder

- Status: active
- Since: 0.1.0
- Source: HAL-6884 (a workspace connector starts where its script is, HAL-2310 part 3), with Mateo's conditions

The Node sandbox adapters shall start a program only in a folder that, where it really is through symbolic links, lies inside the profile's working folder or inside a path of its `readOnlyPaths`, and not inside a path of its `deniedPaths` (unless that part is in `reopenedPaths`) or one of the session's own private folders. A relative start folder is read against the working folder, a part that doesn't exist yet is read through the links above it, and the program starts in the real folder that was checked.

## Examples

- Given a start folder inside a read-only path,
  when the start folder is checked,
  then it is allowed and the real folder comes back.
- Given a start folder in the workspace that is a link to a denied folder,
  when the start folder is checked,
  then it is refused.
- Given a start folder outside the working folder and every read-only path,
  when the start folder is checked,
  then it is refused, naming the folder.
