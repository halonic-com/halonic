# runtime.console-socket

- Status: active
- Since: unreleased
- Source: HAL-18561 (S6b, the console half of `server.device-pairing`); Julian's security note on HAL-18561 (console channel)

The Node runtime shall open the console channel of `halonic serve` as a Unix socket in the folder `console` of the profile folder, named by the first 16 characters of the workspace's key, so its path stays short enough for a socket under macOS's Application Support. It shall make the folder with mode 0700 and bind the socket under a umask of 077, then shall check without following a link that the folder is a folder of this user's with mode 0700, and that the socket is a socket of this user's with mode 0600; it shall refuse to listen otherwise. Every folder above the console folder, by its path as given and by its real path, shall be this user's or root's and writable by no one else, except a folder anyone may write to that has the sticky bit, such as `/tmp`, over a folder of this user's with mode 0700; a link on the way shall be this user's or root's. It shall refuse to listen otherwise, and name that folder. At most 8 connections shall be open at once. A file found at the socket's path before the bind shall be removed only when it is a socket of this user's; anything else there shall refuse the start. One connection shall carry one request, a JSON line of at most 4096 bytes, and get one JSON line back; a longer line, or none within 10 seconds, shall close the connection unanswered. Closing shall remove the socket. A call on the socket shall tell nothing listening there from a server that took the request but closed, or gave no whole reply within 10 seconds, since that server may still carry the request out (HAL-21151). On Windows, and for a path longer than 103 bytes, it shall refuse before it makes anything.

Rationale: only the user who runs the server may pair or revoke a device through its console. The folder is the guard on every Unix, since macOS ignores a socket's own mode; the umask keeps both closed from the moment they exist.

## Examples

- Given a profile folder, when the console socket opens, then its folder is 0700, the socket is 0600, and a request gets its answer back.
- Given a socket left by a `serve` that ended, when the console socket opens, then it replaces it.
- Given a plain file, or a link, at the socket's path, when the console socket opens, then it refuses and the file stays.
- Given a `console` folder that others may open, or that belongs to someone else, when the console socket opens, then it refuses.
- Given a folder above it that others may write to, then it refuses and names that folder; given `/tmp`-like sticky folder over a 0700 folder of this user's, then it opens.
- Given a request line longer than 4096 bytes, then the connection closes without an answer.
- Given a server that takes a request and doesn't reply, when 10 seconds pass, then the call fails as taken but unanswered, not as no server.

## Notes

- Not checked: the peer's user id on each connection (`SO_PEERCRED`), which Node can't read without native code. Julian chose to rely on the folders (HAL-18620, option 3); `peerIsAllowed` in `console-socket.ts` is the one place a native check would go.
