# sandbox-mxc.session

- Status: active
- Since: 0.1.0
- Source: HAL-3305, HAL-3292 (plan), HAL-3503 (grant rules 5 and 6), HAL-2396 (round 2), HAL-3303 (go/no-go), ADR 2026-11-10-mxc-sandbox-backend

The sandbox-mxc adapter shall open a session that gets its own box folder, new for the session and under Halonic's data folder (never `%TEMP%`), and removes it when the session closes, also when the fence wasn't proven. Before anything the caller asks runs, the session shall prove its fence under the session's own policy: a Node probe program in the box must be refused a file no grant names (the hidden-file canary), a file in `deniedPaths` inside a folder it may read, a port of a listener on this computer (on `127.0.0.1` and on `::1` where there is one) and a port of each of the computer's other addresses, tried without a listener so that no Windows Firewall prompt appears, an address on the internet and a public DNS server asked directly, and must read a file in a folder it may read (the allowed-folder control, without which "hidden" proves nothing). A network probe counts as blocked only when the system refused it (`ECONNREFUSED`, `EACCES`, `EPERM`, no route), or when it timed out and the network control succeeded: the box connected to its bridge or, for a profile with no bridge, a control box (the session's policy with a dead-end bridge, run on this computer right before) reached its bridge and was blocked from every address outside (and a timeout counts only on a target where the control box timed out too); the control runs in a twin box, not in the box that is proven; any other error, such as Winsock failing to start, proves nothing and makes the fence `not-fenced`. The Node folder and the proof's own readable folder are readable for the probe only, never for the caller's programs. Anything else, including a probe that printed nothing, couldn't start or ran out of time, and a box folder inside a denied path, shall make the fence `not-fenced` with one plain sentence, and `start` shall then throw and start nothing. The session shall start the caller's programs through MXC's `spawn` with `telemetry: { enabled: false }` on every call, shall never pass `captureDenials`, and shall stop every program and everything it started on `kill`, `close`, an aborted signal and when the time limit runs out (reason `timeout`). Each program shall get the time left of the limit, which counts from `open`. `onBlocked` shall report what the program's own error output shows: Node's `EACCES` and `EPERM` errors that name a path (a read, or a write for calls that change something) and refused connections (`ECONNREFUSED`, `ENETUNREACH`, `EHOSTUNREACH`, `EACCES`) with their address and port; messages with no path or address are not reported.

## Examples

- Given a box where the probe is refused the hidden file, the denied file and the loopback port, and reads the allowed folder,
  when a session is opened,
  then the fence is `fenced`.
- Given a box where the probe can read the hidden file,
  when a session is opened,
  then the fence is `not-fenced` with a reason, `start` throws and no program of the caller starts.
- Given a box where the probe can't read the allowed folder's file,
  when a session is opened,
  then the fence is `not-fenced` (the box is too strict, and its other results prove nothing).
- Given a profile with no bridge, a control box whose probe reaches its bridge and times out to the outside, and a box where blocked probes time out,
  when the session opens,
  then the fence is `fenced`.
- Given a profile with no bridge and a control box whose probe can't reach its bridge or reaches the outside,
  when the session opens,
  then the fence is `not-fenced` and no program of the caller starts.
- Given a profile with no bridge, a control box that was refused on a target, and a box that timed out on the same target,
  when the session opens,
  then the fence is `not-fenced` with a sentence that names the target.
- Given a box where every network probe fails with an error that is no refusal, or times out while the bridge can't be reached,
  when the session opens,
  then the fence is `not-fenced`.
- Given a box where the probe reaches the internet, a public DNS server, a listener on loopback or a connection to another address of this computer,
  when the session opens,
  then the fence is `not-fenced`.
- Given a box where the probe reaches the listener on a loopback port,
  when a session is opened,
  then the fence is `not-fenced`.
- Given a probe program that MXC can't start,
  when a session is opened,
  then the fence is `not-fenced`, and the sentence says the probe could not run.
- Given a profile whose denied path contains Halonic's box folders,
  when a session is opened,
  then the fence is `not-fenced`, and nothing is started.
- Given two sessions opened one after the other,
  when each closes,
  then each had its own box folder, and each is gone once its session closed.
- Given a profile with a non-empty `allowedSites`,
  when a session is opened,
  then opening throws, and no box folder is made and nothing is started.
- Given any session,
  when its programs are started,
  then every call to MXC has telemetry off, none passes `captureDenials` and none has an egress rule.
- Given a program that never ends and a time limit of 400 ms,
  when the limit runs out,
  then the program is killed with the reason `timeout` and the session is stopped.
- Given a program whose error output says `EACCES: permission denied, open` a path,
  when it runs,
  then `onBlocked` gets a refused read of that path.
- Given a program whose error output says `Access is denied.`,
  when it runs,
  then `onBlocked` hears nothing.
