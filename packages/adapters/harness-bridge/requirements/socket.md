# harness-bridge.socket

- Status: active
- Since: 0.1.0
- Source: HAL-6316 (W9: no port of ours open to the user's other WSL distros), plan approved on HAL-6340, srt rule checked on HAL-6341

When the Node bridge server is given a socket folder, it shall serve each run on a Unix socket instead of a loopback port: in a new folder of its own inside the socket folder, created for that run, a real folder owned by this user with mode 0700, never one that already existed, and never an abstract socket. It shall check before it creates anything that the socket's path fits in 107 bytes, and when the socket can't be made it shall fail rather than fall back to a port. Its `url` shall be `http://bridge.halonic.invalid` and it shall give the socket's path. It shall answer only requests whose `Host` is `bridge.halonic.invalid`, with or without port 80, and whose target, when it is a whole URL, names the same, with the `Origin` and token checks of `harness-bridge.server`. It shall open a tunnel only for `CONNECT bridge.halonic.invalid:80` and apply all three checks to every request inside it; any other `CONNECT` shall get a 421 and its connection shall close. Once a request on a connection is refused or fails, the bridge shall serve nothing more on that connection. When it closes, it shall remove the socket and the run's folder, and nothing else.

## Examples

- Given a socket folder,
  when a bridge opens,
  then it listens on a socket in a new folder with mode 0700, its `url` is `http://bridge.halonic.invalid` and it gives the socket's path.
- Given a socket bridge,
  when requests with the token come addressed to `bridge.halonic.invalid`, to `bridge.halonic.invalid:80`, and in absolute form to `http://bridge.halonic.invalid/…`,
  then all are served.
- Given a socket bridge,
  when a request with the token names `bridge.halonic.invalid.`, `bridge.halonic.invalid:8080` or another host in its `Host`, or another host in its absolute target,
  then it gets a 421.
- Given a `CONNECT bridge.halonic.invalid:80`,
  when the bridge accepts it and a request with the token follows inside the tunnel,
  then the request is served; and a request inside a tunnel without the token gets a 401, one with an `Origin` a 403.
- Given a `CONNECT` to `other.example:443` or to `bridge.halonic.invalid:443`, directly or inside a tunnel,
  when the bridge reads it,
  then it answers 421 and closes the connection.
- Given a request without the token followed on the same connection by one with it,
  when both are sent at once,
  then the first gets a 401 and the second is never served.
- Given a socket folder whose path would make the socket's path longer than 107 bytes,
  when a bridge opens,
  then it fails with a message that says so, and creates nothing.
- Given a run folder name that already exists, as a folder or a link,
  when a bridge opens with it,
  then it fails and leaves what was there untouched.
- Given an open socket bridge,
  when it closes, or the run's signal aborts,
  then its socket and its run folder are gone.
