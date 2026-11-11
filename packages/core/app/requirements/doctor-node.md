# app.doctor-node

- Status: active
- Since: 0.1.0
- Source: HAL-6517, decided by Liam on HAL-6513 from the WSL2 first-run research (HAL-6504)

When the host finds a problem with the Node.js that runs Halonic, `halonic doctor` shall show a Node.js line with that problem, marked as a warning and counted with the warnings: Windows' Node.js running Halonic in a WSL folder, or, inside WSL, a `pnpm` on the `PATH` that is Windows' one, with its path. Without a problem, or where the host checks nothing, there shall be no Node.js line. The line shall never be marked as failed, because Halonic still starts.

## Examples

- Given the host finds Windows' Node.js in a WSL folder,
  then the report has a Node.js line ! with `windows-node-in-wsl`, and the summary counts one warning.
- Given the host finds Windows' pnpm on the drive `/mnt/c` inside WSL,
  then the Node.js line is ! with `windows-pnpm` and that path.
- Given the host finds nothing wrong,
  then there is no Node.js line.
