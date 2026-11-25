# cli.commands.serve.devices

- Status: active
- Since: unreleased
- Source: HAL-18561 (S6b, the console half of `server.device-pairing`); HAL-17512 `server-engine` rev 2, §5

The `halonic serve devices` command shall, on the computer that runs `halonic serve` for the workspace, list the paired devices from the running server over its console channel, one line each: the device's name, the day it was last seen, who allowed it (`console`, a browser, or the allowing device by its name) and its id; with none it shall say none are paired and name `halonic serve pair`. With `--revoke <device-id>` it shall sign out that device only, say so, and when it had allowed devices, name them and ask whether to sign them out too; on yes, or with `--yes`, it shall sign out each of them, and on no, or with no terminal to answer, it shall leave them signed in and say how to sign one out. An id that names no paired device shall be refused (exit 4). Without a `serve-password` or a running `serve` it shall refuse as `serve pair` does.

Rationale: a stolen device is signed out from the computer that serves, without ending every other device's session.

## Examples

- Given a device paired with `serve pair`, then `serve devices` lists it as allowed by console.
- Given devices A and B, and C allowed by A, when `serve devices --revoke <A>` is answered no, then A is signed out, B and C stay signed in, and C is named.
- Given the same, with `--yes`, then A and C are signed out.
