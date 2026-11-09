# ports.sandbox-profile

- Status: active
- Since: 0.1.0
- Source: plan section 4.5 (the default profile): a program an agent starts must run inside a fence that Halonic builds and the agent can't change

The `Sandbox` port shall take a profile in Halonic's own format that names the one folder the program writes to, a private temp folder, an optional settings folder, the paths it may only read, the paths it may not touch, the environment variables it gets, the network it may reach and a time limit. The network shall be the Halonic bridge's loopback address plus the listed sites and nothing else, `open` shall reject a bridge address that is not a loopback address, and the environment shall be only the named variables, never the host's.

## Examples

- Given a profile with a working folder, a temp folder, a bridge address, no further sites and a time limit,
  when it is passed to `open`,
  then it compiles.
- Given a profile without a time limit,
  when it is compiled,
  then it doesn't compile.
- Given a profile without a bridge address,
  when it is compiled,
  then it doesn't compile, because a run without the bridge has no model to talk to and an absent field must never mean "the whole network".
- Given a profile whose bridge address is not a loopback address,
  when it is passed to `open`,
  then `open` rejects it.
