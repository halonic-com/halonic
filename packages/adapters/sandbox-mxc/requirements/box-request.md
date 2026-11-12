# sandbox-mxc.box-request

- Status: active
- Since: 0.1.0
- Source: HAL-3305, HAL-3292 (plan, "Grant rules, 12 Nov"), HAL-3503 (grant rules 1 to 4), HAL-2396 (round 2: UI policy, symlink flags), ADR 2026-11-10-mxc-sandbox-backend ("How the adapter runs a program", "The network")

The sandbox-mxc adapter shall turn a profile into what MXC is told: the working, temp and settings folders to read and write, the read-only paths to read (folders only, see grant paths and read-only files), the denied paths, the environment, the network and the command line. The environment shall be only the profile's variables, never the host's, with `TEMP` and `TMP` set to the temp folder and the two Node flags `--preserve-symlinks --preserve-symlinks-main` added to `NODE_OPTIONS` (after any value the profile gave, once), so Node programs that other programs start get them too. A program that is Node itself shall also get the two flags as its first arguments. The UI policy shall be on, with no clipboard and no input injection. The network shall be the bridge as MXC's proxy (egress denied with no rule, ingress allowed with host loopback allowed, `networkProxy` on `http://127.0.0.1:<bridge port>`), or no loopback at all when the profile has no bridge. The adapter shall refuse a profile with a non-empty `allowedSites`, with `reopenedPaths`, or with a bridge that isn't a loopback bridge on `127.0.0.1` with a port number. It shall never pass `captureDenials`, and shall make the temp and settings folders when they aren't there. A program and its arguments shall be quoted so that Windows reads them back as given; a batch file shall be refused, because `cmd.exe` reads its arguments by rules that no quoting makes safe. A program shall start in the working folder or a folder inside it, and nowhere else.

## Examples

- Given a profile with a bridge on port 4100,
  when the request is built,
  then the network proxy is `http://127.0.0.1:4100`, there is no egress rule, and host loopback is allowed.
- Given a profile with no bridge,
  when the request is built,
  then neither egress nor ingress nor host loopback is allowed.
- Given a profile with `allowedSites: ["registry.npmjs.org"]`,
  when the request is built,
  then it is refused, because MXC never runs with the internet partly open.
- Given a profile whose `localhost` or `::1` is the bridge's host,
  when the request is built,
  then it is refused.
- Given a profile with the variable `Temp` and a host with its own secrets in its environment,
  when the request is built,
  then the program gets the profile's variables, `TEMP` and `TMP` as the temp folder and `NODE_OPTIONS`, and nothing of the host's.
- Given the program `node` and the argument `build.js`,
  when the command line is built,
  then it is `node --preserve-symlinks --preserve-symlinks-main build.js`.
- Given an argument with a space, a quote or a trailing backslash,
  when the command line is built,
  then it is quoted so that Windows reads it back as given.
- Given the program `build.cmd`,
  when the command line is built,
  then it is refused.
- Given a program asked to start in a folder outside the working folder,
  when the request is built,
  then it is refused.
