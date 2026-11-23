# coding-tools.paths

- Status: active
- Since: unreleased
- Source: HAL-16752 (plan HAL-16737, section 2; Liam's conditions on HAL-16748)

The coding tools shall read a path the model gives from the agent's working folder, and shall refuse it, without reading anything, when the path as written or the place its links lead to is outside the working folder. Only `read_ranges` shall also accept a path in the server's own test log folder. A path that isn't there shall be refused as missing, and a file to read that is a folder, a named pipe or anything but a plain file shall be refused. The refusal shall say to give a path relative to the working folder.

## Examples

- Given a working folder and a file next to it,
  when the model asks for `../notes.txt`, or for that file by its absolute path,
  then the call is refused as outside the working folder.
- Given a link in the working folder to a file outside it,
  when the model asks for the link,
  then the call is refused and the file isn't read.
- Given a named pipe in the working folder,
  when the model asks `read_ranges` for it,
  then the call is refused at once instead of waiting.
