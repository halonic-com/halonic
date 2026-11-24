# studio.src-tauri.crates.engine-pipe.control-pipe

- Status: draft
- Since: unreleased
- Source: HAL-14220; decision D2 of the B1 design note (HAL-14206) with the security review's changes (HAL-14212)

When the shell reads the background engine's control pipe, it shall read a frame's 4-byte length before allocating for it and refuse a length of 0 or over 64 KiB, and shall accept only the engine's messages (`handshake`, `secret_get`, `token_get`, `origins_get`, `health`, `stopped`) as UTF-8 JSON with exactly their fields. If a frame breaks that, comes before the handshake, is a second handshake, names another protocol version, gives an address other than `http://127.0.0.1:<port>` or a token other than 43 base64url characters, carries a request id not higher than every id before it, is a `stopped` the shell didn't ask for with `stop`, follows `stopped`, or the pipe ends inside a frame, then the shell shall treat it as a fault, whose description never holds the frame's content. The shell shall drop a `health` frame that comes within 1 second of the last one it took, and shall write no frame of its own that is empty or over 128 KiB.

## Examples

- Given a frame whose length prefix says 4 GiB,
  when the shell reads it,
  then it refuses the length without allocating for it.
- Given a `secret_get` as the engine's first frame,
  when the shell reads it,
  then it is a fault.
- Given a handshake with an extra field, or with the address `http://192.168.1.2:4000`,
  when the shell reads it,
  then it is a fault, and the fault's text doesn't hold the token.
- Given requests with ids 1 then 1,
  when the shell reads the second,
  then it is a fault.
- Given two `health` frames half a second apart,
  when the shell reads them,
  then it takes the first and drops the second.
