# cli.run-windows-node-in-wsl

- Status: active
- Since: 0.1.0
- Source: HAL-6517, decided by Liam on HAL-6513 from the WSL2 first-run research (HAL-6504); the words agreed by Elena and Sofia on HAL-6517

While Windows' Node.js runs Halonic (`process.platform` is `win32`) and the workspace's real path is a WSL folder, on a WSL share (`wsl$` or `wsl.localhost`), a run or `runs send` that the sandbox check refuses shall say, as line 2, that this is Windows' Node.js running in a WSL folder and that the fix is to install Node.js inside WSL and run halonic from a WSL terminal, whatever the sandbox's own reason, with the code `windows-node-in-wsl` after the docs link. Anywhere else, the refusal shall keep the sandbox's own reason.

## Examples

- Given Windows' Node.js, a workspace in a WSL folder and a sandbox that needs setting up,
  when `halonic run support-reply` is refused,
  then line 2 is "This is Windows' Node.js, running in a WSL folder, and the sandbox can't start with it. Install Node.js inside WSL and run halonic from a WSL terminal." and line 3 is "More: https://docs.halonic.dev/sandbox (windows-node-in-wsl)".
- Given a workspace that isn't in a WSL folder and bubblewrap missing,
  when the run is refused,
  then the code is `bubblewrap-missing`.
