# cli.doctor-node

- Status: active
- Since: 0.1.0
- Source: HAL-6517, decided by Liam on HAL-6513 from the WSL2 first-run research (HAL-6504); the words agreed by Elena and Sofia on HAL-6517; the Sandbox line's code and the words revised with Sofia on HAL-6544

The `halonic doctor` command shall show a Node.js line, after Harnesses and before Disk, marked with !, when Windows' Node.js runs Halonic (`process.platform` is `win32`) in a working folder on a WSL share (`wsl$` or `wsl.localhost`), or when, on Linux under WSL (`/proc/version` names Microsoft), the `pnpm` that `PATH` finds is under `/mnt/`. The line shall say which, with pnpm's path, and the fix under it, and `doctor` shall still exit with 0 for it. Otherwise there shall be no Node.js line. With Windows' Node.js in a WSL folder and a sandbox that can't start, the Sandbox line shall take the code `windows-node-in-wsl`, with its own shorter reason and fix, whatever the sandbox's own reason. With `--json`, the check shall be `node` with its `problem`, and `pnpm` for Windows' pnpm.

## Examples

- Given Windows' Node.js in a WSL folder,
  when `halonic doctor` runs,
  then it prints "! Node.js     This is Windows' Node.js, running in a WSL folder." and "Fix: install Node.js inside WSL, then run halonic doctor again from a WSL terminal.", and exits with 0.
- Given Windows' Node.js in a WSL folder and a sandbox that doesn't work on Windows,
  when `halonic doctor` runs,
  then the Sandbox line says "Windows' Node.js can't start the sandbox in a WSL folder.", "Fix: install Node.js inside WSL and open a WSL terminal. Then run halonic doctor again." and "More: https://docs.halonic.dev/sandbox (windows-node-in-wsl)".
- Given WSL and Windows' pnpm first on the `PATH`, on the drive `/mnt/c`,
  when `halonic doctor` runs,
  then it prints "pnpm on the PATH is Windows' one:" with its path, and "Fix: install pnpm inside WSL, for example with npm install -g pnpm, then run halonic doctor again.".
- Given Linux outside WSL, or WSL with Linux's own pnpm,
  when `halonic doctor` runs,
  then there is no Node.js line.
