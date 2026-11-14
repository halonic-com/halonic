# cli.commands.serve

- Status: active
- Since: 0.1.0
- Source: HAL-195 (9b-2); phase 4 plan on HAL-9 (secure serve); the trust gate of `cli.serve-trust-gate` (9b-1); the Node runtime of `halonic serve` (`target-node-runtime`)

The `halonic serve` command shall serve the workspace through the secure server (`@halonicjs/host-server`) on the Node listener (`@halonicjs/target-node-runtime`), in the foreground, until Ctrl C or SIGTERM. It shall first refuse, with nothing served, a workspace that isn't trusted on this computer, or changed since (exit 3), a workspace whose history git can't open (exit 9) and a workspace with history but nothing live yet. It shall listen on this computer only, on `--port` (4747 when left out; `--port 0` lets the system choose, for tests), unless `--network` is given, which also needs a sign-in password and a network address. It shall give the server the local engine's executor and run store, the profile's secrets, the scrypt password hasher, the engine's coordination, the read-only trust gate for the served workspace, the routines of the live version for webhooks, and a request count kept on disk in the workspace's folder in the profile. Its first line shall name the workspace and the address and how to stop; when no sign-in password is set, a second line shall say that only this computer can open it and name `halonic secret set serve-password`. It shall close the listener, then the engine, at Ctrl C or SIGTERM.

Rationale: the server asks the trust gate again before every request that starts a run, so a workspace edited behind a running server stops starting runs until a person trusts it again with `halonic trust`. `--network` without a password would leave the workspace open to the home network, so the runtime refuses it.

## Examples

- Given a trusted workspace Acme, when `halonic serve --port 4747` is run,
  then it prints "Serving Acme at http://localhost:4747. Stop with Ctrl C." and `GET /api/hello` answers.
- Given a workspace that was never trusted here, when `halonic serve` is run,
  then it exits 3 with "Nothing was served." and listens on nothing.
- Given `--port 70000`, then it exits 2 and says `--port` needs a whole number from 0 to 65535.
- Given `--network` and no sign-in password, then it refuses and names `halonic secret set serve-password`.
- Given a served workspace edited after trust, then `GET /api/trust` no longer answers `trusted`.
