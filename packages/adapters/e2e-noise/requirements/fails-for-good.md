# e2e-noise.fails-for-good

- Status: active
- Since: unreleased
- Source: HAL-12236 (B1); Julian's conditions 2 and 3 on HAL-12355

If any failure happens (an error from `snow`, a trap, a size over 65,535 bytes, a call out of
order, or keys that don't fit the handshake), then the session shall end, and every later call
shall throw `NoiseSessionError` without saying why. A size over the limit shall be refused before any byte is
copied.

## Examples

- Given a session, when it writes when it is time to read, then it throws, and so does every call
  after.
- Given a transport message replayed, reordered, with a flipped bit or after a failure, then
  reading it throws.
- Given a 65,535-byte transport message, then it goes through; given 65,536 bytes, then the
  session ends.
- Given an instance that traps, then the session ends and its memory is zeroed.
- Given an instance whose buffers don't hold 65,535 bytes, then the session doesn't start.
