# studio.src-tauri.crates.process-probe.process-probe

- Status: draft
- Since: 0.1.0
- Source: HAL-2701, HAL-2719

When the run lock asks whether a process runs, the shell shall answer as Node's `process.kill(pid, 0)` does on the same computer: running when the process is there, including when it runs as another user or may not be looked at, and not running when no process has the id, when the process has exited, or when the id is 0 or above `i32::MAX`. When the run lock asks for this computer's name, the shell shall give the name Node's `os.hostname()` gives, and nothing when the operating system can't tell or the name isn't valid Unicode.

## Examples

- Given the shell's own process,
  when the run lock asks whether it runs,
  then the answer is yes.
- Given a process that has exited and been waited for,
  when the run lock asks whether it runs,
  then the answer is no.
- Given a system process the shell may not signal or open,
  when the run lock asks whether it runs,
  then the answer is yes.
- Given the id 0 or 2,147,483,648,
  when the run lock asks whether it runs,
  then the answer is no.
- Given a Linux computer,
  when the run lock asks for its name,
  then it gets the kernel's host name.
