# studio.engine-lock-lost-toast

- Status: draft
- Since: unreleased
- Source: HAL-13758 (EL1, decided by the team as a fallback state of the approved runs flow, HAL-2282), in the pattern of microcopy 22 F15b; the lost hold: C754 row 11 (HAL-16719, HAL-16724); `studio.engine-service`

When the engine service of an open workspace hears that another process took its engine lock over, the desktop app shall show one info toast "Another Halonic on this computer took over Acme's runs." with the workspace's name, as the window shows it, and the second line "This window stopped running them.", and its **Open Runs** button shall open the Runs list. When the shell lost the lock because it couldn't take its own lock back and nobody took it over (`io`), the toast shall instead say "Halonic lost its hold on Acme's runs." and "This window stopped running them. Open Acme again to run them here.", with the same **Open Runs** button. The run pages stay as they are, because they read the records.

## Examples

- Given the engine of Acme open in this window,
  when another process takes its lock over,
  then one toast says "Another Halonic on this computer took over Acme's runs." and "This window stopped running them.", and **Open Runs** opens the Runs list.
- Given the engine of Acme open in this window,
  when the shell can't take its own lock back and nobody took it over,
  then one toast says "Halonic lost its hold on Acme's runs." and "This window stopped running them. Open Acme again to run them here.", and **Open Runs** opens the Runs list.
- Given the engine of Acme open in this window,
  when it closes with its lock still held,
  then no toast shows.
