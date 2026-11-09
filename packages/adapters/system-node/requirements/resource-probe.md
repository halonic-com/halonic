# system-node.resource-probe

- Status: active
- Since: 0.1.0
- Source: stack 5b of the [HAL-189 implementation plan](/HAL/issues/HAL-189#document-implementation-plan), approved with changes by Liam on HAL-1967 (`childProcesses()` lists the processes below the engine's own pid; the Windows path is spelled out in the pull request); `ResourceProbe` port v1; task HAL-189

The Node resource probe shall pass the `contracts.resource-probe` suite on the real machine. It shall read the engine's memory from the engine process's resident set; list the processes below the engine's pid from `/proc` on Linux, from `Get-CimInstance Win32_Process` in Windows PowerShell on Windows and from `ps` elsewhere, starting each program by its full path and leaving out the program it started to read the table, with everything below it; leave out a Windows process that started before the process its parent pid names; and count a folder's files without following links, stopping at `maxFilesCounted` files and saying the size is incomplete. Free disk space shall be the space a program without special rights can use on the drive of the path or its nearest existing parent folder. A process that ends while the table is read shall be left out; any other read error shall be thrown.

## Examples

- Given a process table where the engine started `claude`, which started `node`, and an unrelated `bash`,
  when the child processes are read,
  then they are `claude` and `node`, in pid order.
- Given a process table read by `ps` or PowerShell, which the engine started,
  when the child processes are read,
  then that program and the processes below it are left out.
- Given a Windows process whose parent pid is the engine's but which started before the engine,
  when the child processes are read,
  then it is left out.
- Given a folder of three files and a limit of two,
  when its size is read,
  then it is the bytes of two files, incomplete.
- Given a symbolic link in a folder to a big file outside it,
  when the folder's size is read,
  then the link adds nothing.
- Given a `/proc` folder where a process's `status` file is gone,
  when the process table is read,
  then that process is left out and the rest are read.
