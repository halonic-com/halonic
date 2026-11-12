# sandbox-mxc.read-only-files

- Status: active
- Since: 0.1.0
- Source: HAL-8066, HAL-7841, HAL-7826 (review of PR 2262), HAL-3503 (grant rule 1)

The sandbox-mxc adapter shall make a read-only path that is a single file readable by copying it into a folder of the session's own box folder, one folder per file, and granting only that folder to read. The copies are a snapshot made when the session opens, and the session shall report each file's original path and its copy, because the program reads the copy and not the original, which no grant names, and shall start the program on the copy: in the command it is given, a read-only file named as the program, as an argument or as the value of an option is replaced by its copy. A file that lies inside a denied path shall not be copied, and a box folder inside a denied path shall not be used for copies; either refuses the session before any program starts, and removes the box folder. The adapter shall never grant the folder around a file instead. The copies go with the box folder when the session closes.

## Examples

- Given a profile whose read-only paths hold a file `config.json`,
  when the session opens,
  then the file is copied into the session's box folder, only that folder of copies is granted to read, and the session reports the copy's path.
- Given two read-only files with the same name in different folders,
  when the session opens,
  then each copy is in its own folder, and neither replaces the other.
- Given a read-only file inside a denied path,
  when the session opens,
  then it is refused, nothing is copied and the box folder is removed.
- Given a read-only file named in the program's arguments,
  when the session starts the program,
  then the program is started with the copy's path in its place.
- Given a session with copied files,
  when it closes,
  then the copies are gone with the box folder.
