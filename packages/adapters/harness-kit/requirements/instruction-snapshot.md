# harness-kit.instruction-snapshot

- Status: active
- Since: unreleased
- Source: HAL-3106, migration plan step 2

The harness kit shall copy a run's instructions (the agent's `AGENTS.md` and its selected skills) into the run's own folder, each file read-only and never over an existing file. It shall pin them by content: one SHA-256 digest per file and one for the whole set, the same for the same files in any order. The pin shall be taken from the text that is written. A name that isn't a plain relative name with `/` (letters, digits, `_`, `-` and inner dots, and not a name Windows reserves for a device), or that is given twice, ignoring letter case, shall be refused before anything is written. The harness kit shall make the run's instructions folder itself, new and its own below the run's folder, and when any file can't be written it shall remove that folder again, whatever its files' mode, and report the write's error. The pin shall have a one-line form for the run log. For a harness run, the harness kit shall take the instructions from the agent's file as the call read it: its `instructions` as `AGENTS.md` (none when empty) and each selected skill as `skills/<id>/SKILL.md`; with neither it shall give no pin and write nothing, and a skill with no text shall fail the call before the harness starts. The folder shall stay until the call releases it; releasing removes it, and doing it again or failing to remove it is no error.

## Examples

- Given the same two files in a different order,
  when each set is pinned,
  then both pins have the same digest.
- Given a name such as `../outside`,
  when the instructions are copied,
  then nothing is written and the error names the file.
- Given a disk that fails on the second file,
  when the instructions are copied into a run's folder,
  then the error is the disk's and no instructions folder is left.
- Given an agent with instructions and one skill,
  when the host's instruction source pins the run,
  then the pin lists `AGENTS.md` and `skills/<id>/SKILL.md` with their digests, and the files are read-only in a folder of the run's own, which is gone once the run's instructions are released.
