# harness-bridge.socket-path-limit

- Status: active
- Since: 0.1.0
- Source: HAL-6316 (the socket bridge on macOS, after the fence tests in HAL-6348)

Before it creates a run's socket folder, the Node bridge server shall check the socket's path against the limit of the system it runs on: 107 bytes on Linux and 103 on macOS. When the path is longer, it shall fail with a message that names the length, the system and its limit, and create nothing.

## Examples

- Given a socket path of 105 bytes,
  when a run's folder is made for macOS,
  then it fails with "socket path would be 105 bytes, and macOS takes at most 103", and nothing is created.
- Given the same socket path,
  when a run's folder is made for Linux,
  then it is made.
