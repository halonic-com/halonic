# runtime.console-socket

- Status: active
- Since: unreleased
- Source: HAL-18561 (S6b, the console half of `server.device-pairing`); Julian's security note on HAL-18561 (console channel)

The Node runtime shall open the console channel of `halonic serve` as a Unix socket in the folder `console` of the profile folder, named by the first 16 characters of the workspace's key, so its path stays short enough for a socket under macOS's Application Support. It shall make the folder with mode 0700 and bind the socket under a umask of 077, then shall check without following a link that the folder is a folder of this user's with mode 0700, and that the socket is a socket of this user's with mode 0600; it shall refuse to listen otherwise. A file found at the socket's path before the bind shall be removed only when it is a socket of this user's; anything else there shall refuse the start. One connection shall carry one request, a JSON line of at most 4096 bytes, and get one JSON line back; a longer line, or none within 10 seconds, shall close the connection unanswered. Closing shall remove the socket. On Windows, and for a path longer than 103 bytes, it shall refuse before it makes anything.

Rationale: only the user who runs the server may pair or revoke a device through its console. The folder is the guard on every Unix, since macOS ignores a socket's own mode; the umask keeps both closed from the moment they exist.

## Examples

- Given a profile folder, when the console socket opens, then its folder is 0700, the socket is 0600, and a request gets its answer back.
- Given a socket left by a `serve` that ended, when the console socket opens, then it replaces it.
- Given a plain file, or a link, at the socket's path, when the console socket opens, then it refuses and the file stays.
- Given a `console` folder that others may open, when the console socket opens, then it refuses.
- Given a request line longer than 4096 bytes, then the connection closes without an answer.

## Notes

- Not checked yet: the peer's user id on each connection (`SO_PEERCRED`), which Node can't read without native code. The open question is on HAL-18620.
