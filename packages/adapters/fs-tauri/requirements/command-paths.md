# fs-tauri.command-paths

- Status: draft
- Since: 0.1.0
- Source: HAL-7876, HAL-1291 (T3 part 5)

The Tauri command paths shall find where connectors' programs are by calling the shell's `command_paths` command with the commands as given, and shall give back the path of each command the shell found, and nothing for a command it did not find or the page did not ask about. It shall not call the shell when there are no commands. A rejection, such as a page without the `desktop-trust` capability, or an answer that is not an object of paths, shall reject with an `unavailable` error that doesn't repeat the shell's text.

## Examples

- Given the commands `npx` and `uvx`, and the shell finds only `npx`,
  when they are looked up,
  then the answer holds the path of `npx` alone.
- Given no commands,
  when they are looked up,
  then the answer is empty and the shell is not called.
- Given the served Studio, which has no `desktop-trust` capability,
  when `npx` is looked up,
  then it rejects with an `unavailable` error that doesn't hold the shell's text.
