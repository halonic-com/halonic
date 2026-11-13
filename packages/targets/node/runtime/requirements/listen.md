# node-runtime.listen

- Status: active
- Since: 0.1.0
- Source: HAL-1128 (CHECK A1 to A3); build plan on HAL-195 (PR 8)

`listenOnNode` shall serve a `host/server` handler over HTTP. By default it shall bind only to the loopback address `127.0.0.1`. With `network: true` it shall bind to every address of this computer, but only when a password is set: without one it shall throw `NetworkNeedsPasswordError` before it binds anything, and the error's message shall say that a password is needed and how to set one. When it starts on the network, it shall report exactly `Open on your phone: http://<LAN address>:<port>`, where the LAN address is the computer's first non-internal IPv4 address, and it shall add that address and port to the host names the server answers to. With no LAN address it shall throw `NoNetworkAddressError` and bind nothing. It shall pass the socket's address to the handler as the client address, never an address from a request header, and shall pass the request body to the handler as a stream.

Rationale: a server that listens beyond this computer without a password would be open to anyone on the network; the printed line is what the phone app and the setup copy rely on.

## Examples

- Given `network: false`, then a connection to the computer's LAN address is refused.
- Given `network: true` and no password, then `listenOnNode` throws and nothing listens.
- Given `network: true`, a password and LAN address `192.168.1.20` on port 4310, then it reports `Open on your phone: http://192.168.1.20:4310`.
