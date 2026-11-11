# sandbox-host.start

- Status: active
- Since: 0.1.0
- Source: HAL-958 design 4.3 (the confirmed path without the fence), built on HAL-983; ADR 2026-11-11-sandbox-without-fence; HAL-4903

The sandbox-host adapter shall provide the `Sandbox` port without a fence: its `check` is always `ok`, its strength is `none` and its sessions' fence proof is `off` until closed, then `stopped`. A session shall start a program with no shell, only the profile's variables and never the launcher's own, inside the working folder, and refuse a program, argument, value of the profile's environment or folder under a skill's `scripts/` folder before anything starts. A bare program name is found on the profile's `PATH`, never in the working folder, and a program that can't be found or started ends with a non-zero code instead of throwing. Killing a program, closing the session, its time limit and the open signal shall stop the program and what it started, and the launcher exiting or getting SIGINT or SIGTERM stops them too. The session reports no blocked accesses, because nothing is fenced off.

## Examples

- Given a launcher whose environment holds a token variable,
  when a session starts a program with a profile that sets only `TMPDIR`,
  then the program sees `TMPDIR` and not the token.
- Given a session,
  when a program is started in a folder outside the working folder,
  then `start` throws and nothing starts.
- Given a program name that isn't on the profile's `PATH`,
  when it is started,
  then `start` returns a program that has ended with a non-zero code.
- Given a running program that started a child of its own,
  when it is killed,
  then both end and the exit's reason is `stopped`.
- Given a session whose time limit runs out,
  then its programs end with the reason `timeout` and its fence proof is `stopped`.
- Given a profile whose `NODE_OPTIONS` names a file under a skill's `scripts/` folder,
  when a session starts `node`,
  then `start` throws and nothing starts.
