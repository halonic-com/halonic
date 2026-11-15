# fs-node.real-path-resolver

- Status: active
- Since: 0.1.0
- Source: HAL-5397 (security condition N3)

The real path resolver shall follow links, junctions and short names, give a path that isn't there yet its nearest existing parent's real path plus the missing names, and mark a file with more than one name as linked. It shall give nothing when it can't tell where a path leads: an error other than "not there", a loop, a path too long, a `..` in the part that isn't there, or a link to nothing.

## Examples

- Given a link in the project to a folder outside it, then the real path is outside.
- Given a new file in an existing folder, then the real path is the folder's real path plus the name.
- Given a link to nothing, a loop of links or `new/../x`, then nothing.
- Given a hard link, then it is linked.
