# shell.engine-restarted-toast

- Status: active
- Since: unreleased
- Source: HAL-1845 (F15b)

When the shell's engine answers again after the shell restarted it, the shell shall show an info toast "The engine stopped and has started again". If the engine ended runs as `interrupted` on the way, then the toast also says how many stopped, and its **Open Runs** button opens the Runs list. The first start, and a start the user asked for with Try again, show no toast.

## Examples

- Given a supervised engine that stopped and was restarted,
  when it reports ready with 2 interrupted runs,
  then a toast says "The engine stopped and has started again." and "2 runs stopped; you can run them again.", with **Open Runs**.
- Given the same restart with no interrupted runs,
  then the toast has only the title and no button.
- Given the engine's first start,
  then no toast shows.
