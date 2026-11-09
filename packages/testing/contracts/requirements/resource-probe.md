# contracts.resource-probe

- Status: active
- Since: 0.1.0
- Source: stack 5a of the [HAL-189 implementation plan](/HAL/issues/HAL-189#document-implementation-plan), with Liam's change on HAL-1967 (each new port gets a contract suite); `ResourceProbe` port v1

Where an adapter implements `ResourceProbe`, it shall give the engine's memory as whole bytes above 0; list the processes below the engine once each, in ascending `pid` order, each with a name and whole bytes of memory; give a folder's size as the sum of the bytes of the files in it and in the folders below it, counting nothing beside it; give 0 bytes, complete, for an empty folder or a path where nothing is; and give the free disk space as whole bytes, also for a path where nothing is yet.

## Examples

- Given a folder with files of 10, 32 and 0 bytes, two of them in folders below it,
  when its size is read,
  then it is 42 bytes, complete.
- Given the folders `logs` and `logs-old` and the file `logs.txt` next to each other,
  when the size of `logs` is read,
  then only the files in `logs` count.
- Given a path where nothing is,
  when its size is read,
  then it is 0 bytes, complete.
- Given a path where nothing is yet, inside a folder that exists,
  when the free disk space is read,
  then it is a whole number of bytes.
