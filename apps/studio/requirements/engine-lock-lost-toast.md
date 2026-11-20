# studio.engine-lock-lost-toast

- Status: draft
- Since: unreleased
- Source: HAL-13758 (EL1, decided by the team as a fallback state of the approved runs flow, HAL-2282), in the pattern of microcopy 22 F15b; `studio.engine-service`

When the engine service of an open workspace hears that another process took its engine lock over, the desktop app shall show one info toast "Another Halonic on this computer took over Acme's runs." with the workspace's name, as the window shows it, and the second line "This window stopped running them.", and its **Open Runs** button shall open the Runs list. The run pages stay as they are, because they read the records the other process keeps writing.

## Examples

- Given the engine of Acme open in this window,
  when another process takes its lock over,
  then one toast says "Another Halonic on this computer took over Acme's runs." and "This window stopped running them.", and **Open Runs** opens the Runs list.
- Given the engine of Acme open in this window,
  when it closes with its lock still held,
  then no toast shows.
