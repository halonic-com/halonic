# cli.connector-sandbox

- Status: active
- Since: 0.1.0
- Source: HAL-2310 (D45, board yes on HAL-2257 Q3); Liam's decision on HAL-8403

The CLI shall start a run's workspace `stdio` connector in a sandbox session of its own, built by Halonic from the connector file, whenever the sandbox works on this computer, with Halonic's own data denied to it. When the sandbox doesn't work, it shall start the connector on this computer as before, under the connector file's trust line, and shall open no session. Reading a source's tool listing outside a run (`halonic tools`) starts a connector as before.

## Examples

- Given a sandbox that works and a trusted workspace with a stdio connector,
  when a run's connector is used,
  then a session opens whose denied paths hold Halonic's data, and the program starts in it, not through the unfenced starter.
- Given a sandbox that doesn't work,
  when a run's connector is used,
  then no session opens and the unfenced starter starts it.
